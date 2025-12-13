import { Node, Connection } from '@/generated/prisma';

/**
 * Get the selected bot from the Bot Router context
 */
export function getSelectedBotFromContext(
  routerData: Record<string, unknown>,
  context: Record<string, unknown>
): string | null {
  const variableName = (routerData.variableName as string) || 'botRouter';
  const routerResult = context[variableName] as { bot?: string } | undefined;
  return routerResult?.bot || null;
}

/**
 * Check if a node is reachable from the Bot Router's selected output
 */
function isNodeReachableFromRouter(
  targetNodeId: string,
  initialConnectedNodes: Set<string>,
  connections: Connection[]
): boolean {
  if (initialConnectedNodes.has(targetNodeId)) {
    return true;
  }

  // Build connection graph
  const graph = new Map<string, Set<string>>();
  for (const conn of connections) {
    if (!graph.has(conn.fromNodeId)) {
      graph.set(conn.fromNodeId, new Set());
    }
    graph.get(conn.fromNodeId)!.add(conn.toNodeId);
  }

  // BFS traversal
  const visited = new Set<string>();
  const queue: string[] = [...initialConnectedNodes];

  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    if (visited.has(currentNodeId)) continue;
    
    visited.add(currentNodeId);
    if (currentNodeId === targetNodeId) return true;

    const connectedNodes = graph.get(currentNodeId);
    if (connectedNodes) {
      for (const connectedNodeId of connectedNodes) {
        if (!visited.has(connectedNodeId)) {
          queue.push(connectedNodeId);
        }
      }
    }
  }

  return false;
}

/**
 * Filter nodes to execute based on Bot Router selection
 */
export function filterNodesByBotRouting(
  routerNodeId: string,
  selectedBot: string,
  sortedNodes: Node[],
  connections: Connection[],
  nodesToExecute: Set<string>
): void {
  console.log(`[Bot Router] ===== FILTERING NODES =====`);
  console.log(`[Bot Router] Selected bot: ${selectedBot}`);
  console.log(`[Bot Router] Router node ID: ${routerNodeId}`);
  console.log(`[Bot Router] Total connections: ${connections.length}`);
  
  // Log ALL connections from the router node
  const allRouterConnections = connections.filter(
    conn => conn.fromNodeId === routerNodeId
  );
  console.log(`[Bot Router] All connections from router (${allRouterConnections.length}):`);
  allRouterConnections.forEach(conn => {
    console.log(`[Bot Router]   - ${conn.fromNodeId} -> ${conn.toNodeId} (fromOutput: "${conn.fromOutput}", toInput: "${conn.toInput}")`);
  });
  
  // Find connections from router's selected bot output
  const expectedOutput = `source-${selectedBot}`;
  console.log(`[Bot Router] Looking for connections with fromOutput: "${expectedOutput}"`);
  
  const routerConnections = connections.filter(
    conn => conn.fromNodeId === routerNodeId && conn.fromOutput === expectedOutput
  );

  console.log(`[Bot Router] Found ${routerConnections.length} connections for bot "${selectedBot}"`);
  if (routerConnections.length === 0) {
    console.error(`[Bot Router] ERROR: No connections found for bot "${selectedBot}"!`);
    console.error(`[Bot Router] Available fromOutputs:`, allRouterConnections.map(c => c.fromOutput));
  }
  
  routerConnections.forEach(conn => {
    console.log(`[Bot Router]   Connection: ${conn.fromNodeId} -> ${conn.toNodeId} (fromOutput: ${conn.fromOutput})`);
  });

  // Get nodes directly connected to selected bot output
  const directlyConnectedNodeIds = new Set(routerConnections.map(conn => conn.toNodeId));
  console.log(`[Bot Router] Directly connected node IDs:`, Array.from(directlyConnectedNodeIds));

  // Remove unreachable nodes (keep nodes before router)
  const routerIndex = sortedNodes.findIndex(n => n.id === routerNodeId);
  console.log(`[Bot Router] Router index: ${routerIndex}`);
  
  for (let i = routerIndex + 1; i < sortedNodes.length; i++) {
    const currentNode = sortedNodes[i];
    const isReachable = isNodeReachableFromRouter(
      currentNode.id,
      directlyConnectedNodeIds,
      connections
    );
    
    console.log(`[Bot Router] Node ${currentNode.id} (${currentNode.type}) is reachable: ${isReachable}`);
    
    if (!isReachable) {
      console.log(`[Bot Router] Removing node ${currentNode.id} from execution`);
      nodesToExecute.delete(currentNode.id);
    }
  }
  
  console.log(`[Bot Router] Final nodes to execute:`, Array.from(nodesToExecute));
  console.log(`[Bot Router] =========================`);
}

/**
 * Filter nodes to execute based on Switch condition result
 * @param matchedCaseIndex - The index of the matched case, or -1 for default case
 */
export function filterNodesBySwitchRouting(
  switchNodeId: string,
  matchedCaseIndex: number,
  sortedNodes: Node[],
  connections: Connection[],
  nodesToExecute: Set<string>
): void {
  console.log(`[Switch] ===== FILTERING NODES =====`);
  console.log(`[Switch] Matched case index: ${matchedCaseIndex}`);
  console.log(`[Switch] Switch node ID: ${switchNodeId}`);
  
  // Find connections from switch's matched output
  // If matchedCaseIndex is -1, no case matched - don't execute any connected nodes
  if (matchedCaseIndex < 0) {
    console.log(`[Switch] No case matched (index: ${matchedCaseIndex}), removing all nodes after switch`);
    const switchIndex = sortedNodes.findIndex(n => n.id === switchNodeId);
    for (let i = switchIndex + 1; i < sortedNodes.length; i++) {
      nodesToExecute.delete(sortedNodes[i].id);
    }
    console.log(`[Switch] =========================`);
    return;
  }
  
  const expectedOutput = `source-${matchedCaseIndex}`;
  console.log(`[Switch] Looking for connections with fromOutput: "${expectedOutput}"`);
  
  const switchConnections = connections.filter(
    conn => conn.fromNodeId === switchNodeId && conn.fromOutput === expectedOutput
  );

  console.log(`[Switch] Found ${switchConnections.length} connections for case ${matchedCaseIndex}`);
  
  // Get nodes directly connected to the selected output
  const directlyConnectedNodeIds = new Set(switchConnections.map(conn => conn.toNodeId));
  console.log(`[Switch] Directly connected node IDs:`, Array.from(directlyConnectedNodeIds));

  // Remove unreachable nodes (keep nodes before switch)
  const switchIndex = sortedNodes.findIndex(n => n.id === switchNodeId);
  console.log(`[Switch] Switch index: ${switchIndex}`);
  
  for (let i = switchIndex + 1; i < sortedNodes.length; i++) {
    const currentNode = sortedNodes[i];
    const isReachable = isNodeReachableFromRouter(
      currentNode.id,
      directlyConnectedNodeIds,
      connections
    );
    
    console.log(`[Switch] Node ${currentNode.id} (${currentNode.type}) is reachable: ${isReachable}`);
    
    if (!isReachable) {
      console.log(`[Switch] Removing node ${currentNode.id} from execution`);
      nodesToExecute.delete(currentNode.id);
    }
  }
  
  console.log(`[Switch] Final nodes to execute:`, Array.from(nodesToExecute));
  console.log(`[Switch] =========================`);
}

