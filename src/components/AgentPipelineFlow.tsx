import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useMemo, useState } from 'react';
import type { AgentRunItem, AgentRunStatus } from '../types';

interface AgentPipelineFlowProps {
  agentRuns: AgentRunItem[];
  onRunInvestigation: () => void;
  investigating: boolean;
}

const STATUS_COLORS: Record<AgentRunStatus, string> = {
  QUEUED: '#666666',
  EXECUTING: '#c3d9f3',
  VERIFIED: '#5fa657',
  PAUSED: '#d4a017',
  COMPLETED: '#5fa657',
  REJECTED: '#cf524c',
};

function AgentStageNode({ data }: NodeProps) {
  const run = data.run as AgentRunItem;
  const selected = Boolean(data.selected);
  const statusColor = STATUS_COLORS[run.status] ?? '#666666';

  return (
    <div
      style={{
        borderColor: selected ? '#ffffff' : statusColor,
      }}
      className="w-[228px] border bg-[#0d0d0d] px-4 py-3 text-left transition-colors"
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !rounded-none !border-0 !bg-[#666666]" />
      <div className="flex items-center justify-between gap-2">
        <span className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
          Stage 0{run.stage_index + 1}
        </span>
        <span
          style={{ color: statusColor }}
          className="font-machined text-[10px] tracking-[1.5px] uppercase"
        >
          {run.status}
        </span>
      </div>
      <div className="font-display mt-1.5 text-[18px] tracking-[1.2px] uppercase text-white">
        {run.agent_name}
      </div>
      <p className="font-editorial mt-1.5 line-clamp-2 text-[13px] leading-snug text-[#cccccc]">
        {run.summary}
      </p>
      {run.duration_ms > 0 && (
        <div className="font-machined mt-2 text-[10px] tracking-[1.5px] uppercase text-[#666666]">
          Duration {run.duration_ms}ms
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !rounded-none !border-0 !bg-[#666666]" />
    </div>
  );
}

const nodeTypes = { agentStage: AgentStageNode };

export function AgentPipelineFlow({
  agentRuns,
  onRunInvestigation,
  investigating,
}: AgentPipelineFlowProps) {
  const [selectedStageId, setSelectedStageId] = useState<string>('reconciler');

  const selectedRun =
    agentRuns.find((r) => r.stage_id === selectedStageId) ?? agentRuns[0] ?? null;

  const { nodes, edges } = useMemo(() => {
    const builtNodes: Node[] = agentRuns.map((run, idx) => ({
      id: run.stage_id,
      type: 'agentStage',
      position: { x: idx * 270, y: idx % 2 === 0 ? 36 : 112 },
      data: { run, selected: run.stage_id === selectedStageId },
    }));

    const builtEdges: Edge[] = [];
    for (let i = 0; i < agentRuns.length - 1; i += 1) {
      const from = agentRuns[i];
      const to = agentRuns[i + 1];
      const active =
        from.status === 'VERIFIED' ||
        from.status === 'COMPLETED' ||
        to.status === 'EXECUTING';

      builtEdges.push({
        id: `e-${from.stage_id}-${to.stage_id}`,
        source: from.stage_id,
        target: to.stage_id,
        animated: to.status === 'EXECUTING',
        style: {
          stroke: active ? '#c3d9f3' : '#3a3a3a',
          strokeWidth: active ? 1.5 : 1,
        },
      });
    }

    return { nodes: builtNodes, edges: builtEdges };
  }, [agentRuns, selectedStageId]);

  let parsedFindings: Record<string, unknown> = {};
  if (selectedRun?.findings_json) {
    try {
      parsedFindings = JSON.parse(selectedRun.findings_json);
    } catch {
      parsedFindings = {};
    }
  }

  return (
    <div className="border border-[#262626] bg-[#0d0d0d]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#262626] px-6 py-5">
        <div>
          <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
            LangGraph-Equivalent State Machine · Live SSE Execution
          </div>
          <h3 className="font-display mt-1 text-[28px] tracking-[2px] uppercase text-white">
            Multi-Agent Investigation Pipeline
          </h3>
        </div>
        <button
          type="button"
          onClick={onRunInvestigation}
          disabled={investigating}
          className="btn-aureon-pill"
        >
          {investigating ? 'Investigating...' : 'Run Investigation'}
        </button>
      </div>

      <div className="h-[310px] w-full bg-black">
        {agentRuns.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => setSelectedStageId(node.id)}
            nodesDraggable={false}
            nodesConnectable={false}
            panOnScroll={false}
          >
            <Background color="#1f1f1f" gap={28} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <div className="flex h-full items-center justify-center font-machined text-[12px] tracking-[2px] uppercase text-[#666666]">
            Select an incident dossier to inspect agent graph
          </div>
        )}
      </div>

      {selectedRun && (
        <div className="grid grid-cols-1 gap-6 border-t border-[#262626] bg-[#141414] p-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
              Selected Node · Stage 0{selectedRun.stage_index + 1} · {selectedRun.status}
            </div>
            <h4 className="font-display mt-1 text-[22px] tracking-[1.5px] uppercase text-white">
              {selectedRun.agent_name}
            </h4>
            <p className="font-editorial mt-3 text-[16px] leading-relaxed text-[#cccccc]">
              {selectedRun.summary}
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="font-machined mb-2 text-[11px] tracking-[2px] uppercase text-[#999999]">
              Structured Forensic Output
            </div>
            <pre className="max-h-[160px] overflow-auto border border-[#262626] bg-black p-4 font-machined text-[11px] leading-relaxed text-[#c3d9f3]">
              {Object.keys(parsedFindings).length > 0
                ? JSON.stringify(parsedFindings, null, 2)
                : '// Stage queued — click Run Investigation to stream real cryptographic findings.'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
