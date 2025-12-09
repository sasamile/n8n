import type { Node as PrismaNode, Connection } from "@/generated/prisma";
import type { NodeType } from "@/generated/prisma";
import { getExecutor } from "./executor-registry";
import type { WorkflowContext } from "../types";
import type { StepTools } from "../types";
import type { Realtime } from "@inngest/realtime";

/**
 * Get all nodes connected as "tools" (children) of a given node
 * For AI Agent nodes, only get tools connected to handles starting with "tool-"
 * For other nodes (like OpenAI), get all outgoing connections as tools
 */
export function getConnectedToolNodes(
  nodeId: string,
  nodes: PrismaNode[],
  connections: Connection[]
): PrismaNode[] {
  // Find the source node to check its type
  const sourceNode = nodes.find(node => node.id === nodeId);
  const isAiAgent = sourceNode?.type === 'AI_AGENT';

  // Find all connections where this node is the source
  const outgoingConnections = connections.filter(
    conn => {
      if (conn.fromNodeId === nodeId) {
        if (isAiAgent) {
          // For AI Agent: ONLY get connections from handles that start with "tool-"
          // Regular output connections (source-1) are NOT tools
          return conn.fromOutput && conn.fromOutput.startsWith('tool-');
        } else {
          // For other nodes (like OpenAI): get all outgoing connections as tools
          // But exclude tool- connections to avoid confusion
          return !conn.fromOutput || !conn.fromOutput.startsWith('tool-');
        }
      }
      return false;
    }
  );

  // Get the target nodes
  const toolNodeIds = new Set(outgoingConnections.map(conn => conn.toNodeId));
  const toolNodes = nodes.filter(node => toolNodeIds.has(node.id));

  return toolNodes;
}

/**
 * Execute a tool node and return its result
 */
export async function executeToolNode(
  toolNode: PrismaNode,
  context: WorkflowContext,
  userId: string,
  step: StepTools,
  publish: Realtime.PublishFn,
  workflow: { nodes: PrismaNode[]; connections: Connection[] }
): Promise<WorkflowContext> {
  const executor = getExecutor(toolNode.type as NodeType);
  const result = await executor({
    data: toolNode.data as Record<string, unknown>,
    nodeId: toolNode.id,
    userId,
    context,
    step,
    publish,
    workflow,
  });
  return result;
}

/**
 * Convert a tool node to a function definition for the LLM
 */
export function nodeToToolFunction(toolNode: PrismaNode): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
} {
  // Use node name as base, but make it more descriptive and unique
  // The node name should be descriptive enough for the model to understand
  const nodeNameBase = toolNode.name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
  
  // Generate description and parameters based on node type
  let description = '';
  let parameters: Record<string, any> = {};
  let nodeName = nodeNameBase;
  
  switch (toolNode.type) {
    case 'HTTP_REQUEST': {
      const data = toolNode.data as { endpoint?: string; method?: string; body?: string; variableName?: string };
      const endpoint = data.endpoint || '';
      
      // Create more specific description and name based on endpoint
      if (endpoint.includes('productos') || endpoint.includes('products') || nodeNameBase.includes('producto') || nodeNameBase.includes('catalogo') || nodeNameBase.includes('catálogo')) {
        // Use descriptive name for productos - prioritize node name if it's descriptive
        if (nodeNameBase.includes('producto') || nodeNameBase.includes('catalogo') || nodeNameBase.includes('catálogo') || nodeNameBase.includes('ver_productos')) {
          nodeName = nodeNameBase;
        } else {
          nodeName = `ver_productos`;
        }
        // Ensure it starts with a letter and is valid
        nodeName = nodeName.replace(/^[^a-z]/, 'f_').substring(0, 64);
        
        description = `🔍 HERRAMIENTA ESPECÍFICA: Obtener catálogo de productos. 
        
✅ USA ESTA HERRAMIENTA SOLO cuando el usuario pida EXPLÍCITAMENTE:
- "ver productos", "ver catálogo", "mostrar productos", "mostrar catálogo"
- "quiero ver productos", "quiero ver el catálogo", "muéstrame productos"
- "lista de productos", "qué productos tienen", "dame el catálogo"
- "productos disponibles", "ver qué tienen"

❌ NO USES esta herramienta para:
- Saludos: "hola", "hi", "buenos días"
- Preguntas generales sobre el negocio
- Solicitudes de crear tareas
- Cualquier otra cosa que NO sea ver productos/catálogo

Esta herramienta hace un GET a ${endpoint} para obtener la lista de productos disponibles.`;
      } else if (endpoint.includes('tareas') || endpoint.includes('tasks') || nodeNameBase.includes('tarea')) {
        // Use descriptive name for tareas - prioritize node name if it's descriptive
        if (nodeNameBase.includes('tarea') || nodeNameBase.includes('crear_tarea')) {
          nodeName = nodeNameBase;
        } else {
          nodeName = `crear_tarea`;
        }
        // Ensure it starts with a letter and is valid
        nodeName = nodeName.replace(/^[^a-z]/, 'f_').substring(0, 64);
        
        description = `📝 HERRAMIENTA ESPECÍFICA: Crear una nueva tarea.
        
✅ USA ESTA HERRAMIENTA SOLO cuando el usuario pida EXPLÍCITAMENTE:
- "crear tarea", "agregar tarea", "necesito crear una tarea"
- "hacer una tarea", "nueva tarea", "quiero crear una tarea"
- "agendar tarea", "registrar tarea"

❌ NO USES esta herramienta para:
- Saludos: "hola", "hi", "buenos días"
- Ver productos o catálogos
- Preguntas generales
- Cualquier otra cosa que NO sea crear una tarea

ESTRUCTURA DEL BODY:
Esta herramienta hace un POST a ${endpoint} con el siguiente formato JSON:
{
  "titulo": "Título de la tarea (extrae del mensaje del usuario)",
  "descripcion": "Descripción de la tarea (extrae del mensaje del usuario)"
}

IMPORTANTE: Extrae el título y la descripción del mensaje del usuario. Si el usuario dice "crear una tarea que el titulo sea X y de descripcion sea Y", usa X como titulo e Y como descripcion.`;
      } else {
        // For other HTTP requests, use node name as-is (should be descriptive)
        nodeName = nodeNameBase.replace(/^[^a-z]/, 'f_').substring(0, 64);
        description = `🌐 HERRAMIENTA HTTP: Hacer una petición HTTP a una API externa.
        
✅ USA ESTA HERRAMIENTA SOLO cuando el usuario solicite EXPLÍCITAMENTE obtener datos de una API externa o realizar una operación específica que requiera esta petición.

❌ NO USES esta herramienta para:
- Saludos simples
- Ver productos (usa la herramienta específica de productos)
- Crear tareas (usa la herramienta específica de tareas)
- Conversaciones casuales

Endpoint: ${endpoint || 'No configurado'}`;
      }
      
      // Define parameters based on whether it's a tarea creation
      if (endpoint.includes('tareas') || endpoint.includes('tasks') || nodeNameBase.includes('tarea')) {
        // For tarea creation, use specific parameters
        parameters = {
          titulo: {
            type: 'string',
            description: 'El título de la tarea. Extrae este valor del mensaje del usuario. Ejemplo: si el usuario dice "crear una tarea que el titulo sea hola mundo", usa "hola mundo" como titulo.',
          },
          descripcion: {
            type: 'string',
            description: 'La descripción de la tarea. Extrae este valor del mensaje del usuario. Ejemplo: si el usuario dice "de descripcion sea como va todo", usa "como va todo" como descripcion.',
          },
        };
      } else {
        // For other HTTP requests, use generic parameters
      parameters = {
        endpoint: {
          type: 'string',
          description: `La URL del endpoint de la API. Ejemplo: ${endpoint || 'https://api.example.com/data'}`,
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          description: 'Método HTTP a usar',
        },
        body: {
          type: 'object',
          description: 'Cuerpo de la petición (para POST/PUT/PATCH)',
        },
      };
      }
      break;
    }
    case 'POSTGRESQL': {
      description = 'Execute a SQL query on the PostgreSQL database';
      parameters = {
        query: {
          type: 'string',
          description: 'SQL query to execute',
        },
      };
      break;
    }
    case 'REDIS': {
      description = 'Perform Redis operations (GET, SET, DELETE)';
      parameters = {
        operation: {
          type: 'string',
          enum: ['GET', 'SET', 'DELETE'],
          description: 'Redis operation to perform',
        },
        key: {
          type: 'string',
          description: 'Redis key',
        },
        value: {
          type: 'string',
          description: 'Value to set (for SET operation)',
        },
      };
      break;
    }
    default:
      // For other node types, use node name as-is
      nodeName = nodeNameBase || 'tool';
      nodeName = nodeName.replace(/^[^a-z]/, 'f_').substring(0, 64);
      description = `Execute ${toolNode.name} operation`;
      parameters = {
        input: {
          type: 'string',
          description: 'Input data for the operation',
        },
      };
  }

  // Ensure nodeName is always valid
  if (!nodeName || nodeName.length === 0) {
    nodeName = 'tool';
  }
  nodeName = nodeName.replace(/^[^a-z]/, 'f_').substring(0, 64);

  // Determine required fields based on tool type
  let required: string[] = [];
  if (toolNode.type === 'HTTP_REQUEST') {
    const data = toolNode.data as { endpoint?: string };
    const endpoint = data.endpoint || '';
    const nodeNameBase = toolNode.name.toLowerCase().replace(/\s+/g, '_');
    
    if (endpoint.includes('tareas') || endpoint.includes('tasks') || nodeNameBase.includes('tarea')) {
      // For tarea creation, titulo and descripcion are required
      required = ['titulo', 'descripcion'];
    } else {
      // For other HTTP requests, endpoint is required
      required = ['endpoint'];
    }
  } else if (toolNode.type === 'POSTGRESQL') {
    required = ['query'];
  } else if (toolNode.type === 'REDIS') {
    required = ['operation', 'key'];
  }

  return {
    type: 'function',
    function: {
      name: nodeName,
      description,
      parameters: {
        type: 'object',
        properties: parameters,
        required,
      },
    },
  };
}

