export const GRAPH_NODE_RADIUS = 6;

type GraphPoint = { x: number; y: number };
export type GraphEdgePoints = { x1: number; y1: number; x2: number; y2: number };
type GraphDescription = {
  directed: boolean;
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ from: string; to: string }>;
};

export const graphTextAlternative = (graph: GraphDescription): string => {
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const edges = graph.edges.map((edge) => {
    const from = labels.get(edge.from) ?? edge.from;
    const to = labels.get(edge.to) ?? edge.to;
    return graph.directed ? `${from} to ${to}` : `${from} and ${to}`;
  });
  return `${graph.directed ? "Directed" : "Undirected"} graph. Nodes: ${graph.nodes.map((node) => node.label).join(", ")}. Edges: ${edges.join(", ") || "none"}.`;
};

export const graphEdgePoints = (from: GraphPoint, to: GraphPoint): GraphEdgePoints => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  const unitX = dx / length;
  const unitY = dy / length;
  const targetOffset = GRAPH_NODE_RADIUS + 2;
  return {
    x1: from.x + unitX * GRAPH_NODE_RADIUS,
    y1: from.y + unitY * GRAPH_NODE_RADIUS,
    x2: to.x - unitX * targetOffset,
    y2: to.y - unitY * targetOffset,
  };
};
