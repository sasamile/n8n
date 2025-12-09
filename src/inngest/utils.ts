import { Node, Connection, NodeType } from '@/generated/prisma';
import toposort from 'toposort';
import { inngest } from './client';
import { createId } from "@paralleldrive/cuid2";

/**
 * Try to find a cycle path in the edges
 */
function findCyclePath(edges: [string, string][]): string[] | null {
    // Build adjacency list
    const graph = new Map<string, string[]>();
    edges.forEach(([from, to]) => {
        if (!graph.has(from)) {
            graph.set(from, []);
        }
        graph.get(from)!.push(to);
    });

    // DFS to find cycle
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    function dfs(node: string): boolean {
        if (recStack.has(node)) {
            // Found cycle, reconstruct path
            const cycleStart = path.indexOf(node);
            return true;
        }
        if (visited.has(node)) {
            return false;
        }

        visited.add(node);
        recStack.add(node);
        path.push(node);

        const neighbors = graph.get(node) || [];
        for (const neighbor of neighbors) {
            if (dfs(neighbor)) {
                return true;
            }
        }

        recStack.delete(node);
        path.pop();
        return false;
    }

    for (const node of graph.keys()) {
        if (!visited.has(node)) {
            if (dfs(node)) {
                return path;
            }
        }
    }

    return null;
}

export const topologicalSort = (
    nodes: Node[],
    connections: Connection[],
): Node[] => {
    // If no connections, return the node array
    if (connections.length === 0) return nodes;

    // Filter out tool connections (tool-*) from normal flow execution
    // Tool connections should only be executed when the LLM explicitly calls them
    const normalFlowConnections = connections.filter(conn => {
        // Exclude connections from tool handles (tool-1, tool-2, etc.)
        // These are special handles for AI Agent tools and should not be in the normal flow
        if (conn.fromOutput && conn.fromOutput.startsWith('tool-')) {
            console.log(`[TopologicalSort] Filtering out tool connection: ${conn.fromNodeId} -> ${conn.toNodeId} (fromOutput: ${conn.fromOutput})`);
            return false;
        }
        return true;
    });

    console.log(`[TopologicalSort] Total connections: ${connections.length}, Normal flow connections: ${normalFlowConnections.length}, Tool connections filtered: ${connections.length - normalFlowConnections.length}`);

    // Identify tool nodes (nodes connected from tool-* handles)
    // These nodes should ONLY be executed when the AI Agent explicitly calls them
    // They should NOT be in the normal workflow execution flow
    const toolNodeIds = new Set<string>();
    connections.forEach(conn => {
        if (conn.fromOutput && conn.fromOutput.startsWith('tool-')) {
            toolNodeIds.add(conn.toNodeId);
        }
    });
    console.log(`[TopologicalSort] Tool nodes (connected from tool-* handles - will be EXCLUDED from normal flow):`, Array.from(toolNodeIds));

    // Identify AI Agent nodes
    const aiAgentNodeIds = new Set<string>();
    nodes.forEach(node => {
        if (node.type === NodeType.AI_AGENT) {
            aiAgentNodeIds.add(node.id);
        }
    });
    console.log(`[TopologicalSort] AI Agent nodes:`, Array.from(aiAgentNodeIds));

    // Check for problematic connections: tool nodes that have normal flow connections back to AI Agent
    const problematicConnections: Connection[] = [];
    normalFlowConnections.forEach(conn => {
        if (toolNodeIds.has(conn.fromNodeId) && aiAgentNodeIds.has(conn.toNodeId)) {
            problematicConnections.push(conn);
        }
    });
    
    if (problematicConnections.length > 0) {
        console.warn(`[TopologicalSort] WARNING: Found ${problematicConnections.length} connection(s) from tool nodes back to AI Agent:`);
        problematicConnections.forEach(c => {
            console.warn(`[TopologicalSort]   - Tool node ${c.fromNodeId} -> AI Agent ${c.toNodeId} (${c.fromOutput} -> ${c.toInput})`);
        });
        console.warn(`[TopologicalSort] Tool nodes should NOT have normal flow connections back to AI Agent.`);
        console.warn(`[TopologicalSort] Tool results are returned to AI Agent automatically via the tool execution result.`);
    }

    //Create the edges array for toposort (only using normal flow connections)
    const edges: [string, string][] = normalFlowConnections.map((conn) => [
        conn.fromNodeId,
        conn.toNodeId,
    ]);
    
    console.log(`[TopologicalSort] Edges for topological sort:`, edges);

    // Track which nodes are connected in the normal flow (as source or target)
    const connectedAsSource = new Set<string>();
    const connectedAsTarget = new Set<string>();
    for (const conn of normalFlowConnections) {
        connectedAsSource.add(conn.fromNodeId);
        connectedAsTarget.add(conn.toNodeId);
    }

    // Identify isolated nodes (nodes with no normal flow connections)
    // These are nodes that only have tool-* connections or no connections at all
    // We don't add self-edges for them because toposort may detect them as cycles
    // Instead, we'll add them to the sorted result at the end
    const isolatedNodes: string[] = [];
    for (const node of nodes) {
        // A node is isolated if it's not connected as source or target in normal flow
        if (!connectedAsSource.has(node.id) && !connectedAsTarget.has(node.id)) {
            isolatedNodes.push(node.id);
        }
    }
    
    console.log(`[TopologicalSort] Isolated nodes (only tool connections or no connections):`, isolatedNodes);
    console.log(`[TopologicalSort] Final edges count (excluding isolated nodes):`, edges.length);

    //Perfom topological sort
    let sortedNodeIds: string[];
    try {
        sortedNodeIds = toposort(edges);
        //Remove duplicate edges
        sortedNodeIds = [...new Set(sortedNodeIds)];
    } catch (error) {
        if (error instanceof Error && error.message.includes('Cyclic')) {
            console.error(`[TopologicalSort] ===== CYCLE DETECTED =====`);
            console.error(`[TopologicalSort] Total connections: ${connections.length}`);
            console.error(`[TopologicalSort] Tool connections filtered: ${connections.length - normalFlowConnections.length}`);
            console.error(`[TopologicalSort] Normal flow connections (${normalFlowConnections.length}):`);
            normalFlowConnections.forEach(c => {
                console.error(`[TopologicalSort]   - ${c.fromNodeId} (${c.fromOutput}) -> ${c.toNodeId} (${c.toInput})`);
            });
            console.error(`[TopologicalSort] Edges for topological sort:`, edges);
            
            // Try to identify which nodes are in the cycle
            const nodeIdsInEdges = new Set<string>();
            edges.forEach(([from, to]) => {
                nodeIdsInEdges.add(from);
                nodeIdsInEdges.add(to);
            });
            console.error(`[TopologicalSort] Nodes involved in edges:`, Array.from(nodeIdsInEdges));
            
            // Find potential cycle paths
            const cycleInfo = findCyclePath(edges);
            if (cycleInfo) {
                console.error(`[TopologicalSort] Potential cycle path:`, cycleInfo);
            }
            
            console.error(`[TopologicalSort] =========================`);
            throw new Error(`Workflow contains a cycle. Check connections between nodes. Tool connections (tool-*) are excluded from flow. See logs for details.`);
        }
        throw error;
    }
    // Map sorted IDs back to node objects
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const sortedNodes = sortedNodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);
    
    // CRITICAL: Exclude tool nodes from the normal execution flow
    // Tool nodes should ONLY be executed when the AI Agent explicitly calls them
    // They should NOT be in the sorted nodes list for normal workflow execution
    const filteredSortedNodes = sortedNodes.filter(node => !toolNodeIds.has(node.id));
    
    // Also filter isolated nodes - if they are tool nodes, exclude them
    const isolatedNodeObjects = isolatedNodes
        .map((id) => nodeMap.get(id))
        .filter(Boolean)
        .filter(node => !toolNodeIds.has(node.id)) as Node[];
    
    const excludedToolNodes = sortedNodes.filter(node => toolNodeIds.has(node.id));
    console.log(`[TopologicalSort] Excluded ${excludedToolNodes.length} tool node(s) from normal flow:`, excludedToolNodes.map(n => n.name || n.id));
    console.log(`[TopologicalSort] Adding ${isolatedNodeObjects.length} isolated node(s) at the end (excluding tool nodes)`);
    
    return [...filteredSortedNodes, ...isolatedNodeObjects];
};

export const sendWorkflowExecution = async (data: {
    workflowId: string;
    [key: string]: any;
}) => {
    await inngest.send({
        name: 'workflows/execute.workflow',
        data,
        id: createId(),
    });
}
