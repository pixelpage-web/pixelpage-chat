"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import Link from "next/link";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Monitor,
  PlayCircle,
  Redo2,
  Rocket,
  Save,
  Undo2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  validateFlow,
  type FlowDefinition,
  type FlowEdge,
  type FlowNode,
  type FlowNodeData,
  type FlowNodeType,
  type FlowValidationError,
} from "@/lib/flow-types";
import type { FlowRow, Json } from "@/types/database";
import { FlowNodeRenderer, type EditorNodeData } from "./flow-node";
import { NodeConfigPanel, type TeamOption, type UnitOption } from "./node-config-panel";
import { FlowSimulator } from "./flow-simulator";
import { nodeMeta, paletteOrder } from "./node-meta";

/**
 * Editor visual de fluxos (React Flow): paleta à esquerda, canvas no centro,
 * configuração do bloco/simulador à direita, salvar/publicar/testar no topo.
 */

// Todos os tipos usam o mesmo renderizador (estável entre renders)
const nodeTypes: NodeTypes = Object.fromEntries(
  Object.keys(nodeMeta).map((type) => [type, FlowNodeRenderer])
) as NodeTypes;

const defaultEdgeOptions = {
  type: "smoothstep" as const,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#64748B" },
  style: { stroke: "#64748B", strokeWidth: 1.5 },
};

/** Configuração inicial de cada bloco recém-arrastado. */
function defaultDataFor(type: FlowNodeType): FlowNodeData {
  switch (type) {
    case "message":
      return { text: "", buttons: [] };
    case "question":
      return { question: "", variable: "", answerType: "text" };
    case "condition":
      return { keywords: "" };
    case "menu":
      return { menuTitle: "Escolha uma das opções abaixo:", options: ["", ""] };
    case "ai":
      return { aiInstructions: "", aiContinue: "always" };
    case "handoff":
      return { handoffMessage: "", assignTo: null, generateSummary: true };
    case "tag":
      return { tag: "" };
    case "wait":
      return { waitAmount: 30, waitUnit: "minutes" };
    case "end":
      return { endMessage: "" };
    default:
      return {};
  }
}

interface Snapshot {
  nodes: Node<EditorNodeData>[];
  edges: Edge[];
}

/** Remove flags transitórias (seleção, erro) para comparação/persistência. */
function cleanSnapshot(nodes: Node<EditorNodeData>[], edges: Edge[]): Snapshot {
  return {
    nodes: nodes.map((n) => {
      const data = { ...n.data };
      delete data.__error;
      return { id: n.id, type: n.type, position: n.position, data } as Node<EditorNodeData>;
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })) as Edge[],
  };
}

function toDefinition(nodes: Node<EditorNodeData>[], edges: Edge[]): FlowDefinition {
  const snap = cleanSnapshot(nodes, edges);
  return {
    nodes: snap.nodes.map((n) => ({
      id: n.id,
      type: (n.type ?? "message") as FlowNodeType,
      position: n.position,
      data: n.data as FlowNodeData,
    })),
    edges: snap.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  };
}

function fromDefinition(def: FlowDefinition): Snapshot {
  return {
    nodes: def.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: (n.data ?? {}) as EditorNodeData,
    })),
    edges: def.edges.map((e) => ({
      ...e,
      ...defaultEdgeOptions,
    })),
  };
}

function EditorInner({
  flow,
  initialDefinition,
  team,
  units,
}: {
  flow: FlowRow;
  initialDefinition: FlowDefinition;
  team: TeamOption[];
  units: UnitOption[];
}) {
  const t = useT();
  const supabase = useMemo(() => createClient(), []);
  const instance = useReactFlow();

  const initial = useMemo(() => fromDefinition(initialDefinition), [initialDefinition]);
  const [nodes, setNodes] = useState<Node<EditorNodeData>[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [name, setName] = useState(flow.name);
  const [status, setStatus] = useState(flow.status);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<FlowValidationError[]>([]);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  // ----------------------------------------------------------- desfazer/refazer
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const currentSnap = useRef<Snapshot>(cleanSnapshot(initial.nodes, initial.edges));
  const restoring = useRef(false);

  useEffect(() => {
    if (restoring.current) {
      restoring.current = false;
      currentSnap.current = cleanSnapshot(nodes, edges);
      return;
    }
    const timer = setTimeout(() => {
      const next = cleanSnapshot(nodes, edges);
      if (JSON.stringify(next) === JSON.stringify(currentSnap.current)) return;
      past.current.push(currentSnap.current);
      if (past.current.length > 50) past.current.shift();
      future.current = [];
      currentSnap.current = next;
      setDirty(true);
    }, 350);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  const restore = useCallback((snap: Snapshot) => {
    restoring.current = true;
    setNodes(snap.nodes.map((n) => ({ ...n })));
    setEdges(snap.edges.map((e) => ({ ...e, ...defaultEdgeOptions })));
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(currentSnap.current);
    restore(prev);
  }, [restore]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(currentSnap.current);
    restore(next);
  }, [restore]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // Não interceptar atalhos dentro de inputs/textareas do painel
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ------------------------------------------------------------------ mutações
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      // Início não recebe conexões e nada conecta em si mesmo
      const target = instance.getNode(conn.target);
      if (!target || target.type === "start" || conn.source === conn.target) return;
      setEdges((eds) =>
        addEdge(
          { ...conn, ...defaultEdgeOptions },
          // Uma única conexão por saída: substitui a existente do mesmo handle
          eds.filter(
            (e) =>
              !(
                e.source === conn.source &&
                (e.sourceHandle ?? "out") === (conn.sourceHandle ?? "out")
              )
          )
        )
      );
    },
    [instance]
  );

  const addNodeAt = useCallback(
    (type: FlowNodeType, position: { x: number; y: number }) => {
      const id = `n_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
      setNodes((nds) => [
        ...nds,
        { id, type, position, data: defaultDataFor(type) as EditorNodeData },
      ]);
      setSelectedId(id);
    },
    []
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/pixelpage-flow") as FlowNodeType;
      if (!type || !nodeMeta[type]) return;
      const position = instance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeAt(type, position);
    },
    [instance, addNodeAt]
  );

  const updateNodeData = useCallback((id: string, patch: Partial<EditorNodeData>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch, __error: false } } : n
      )
    );
  }, []);

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
    },
    []
  );

  // ------------------------------------------------------------------ validação
  const runValidation = useCallback((): FlowValidationError[] => {
    const found = validateFlow(toDefinition(nodes, edges));
    setErrors(found);
    const errorIds = new Set(found.map((e) => e.nodeId).filter(Boolean));
    setNodes((nds) =>
      nds.map((n) => ({ ...n, data: { ...n.data, __error: errorIds.has(n.id) } }))
    );
    return found;
  }, [nodes, edges]);

  // ----------------------------------------------------------------- persistência
  const persist = useCallback(
    async (nextStatus: "draft" | "published") => {
      const def = toDefinition(nodes, edges);
      const trimmedName = name.trim() || "Novo fluxo";
      if (nextStatus === "published") {
        // publish_flow despublica, na mesma transação, qualquer outro fluxo
        // já published na mesma conexão — garante no máximo 1 por conexão.
        const { error } = await supabase.rpc("publish_flow", {
          p_flow_id: flow.id,
          p_name: trimmedName,
          p_canvas_data: def as unknown as Json,
        });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("flows")
          .update({
            name: trimmedName,
            status: nextStatus,
            canvas_data: def as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq("id", flow.id);
        if (error) throw new Error(error.message);
      }
      setStatus(nextStatus);
      setDirty(false);
    },
    [nodes, edges, name, supabase, flow.id]
  );

  async function handleSave() {
    setSaving(true);
    try {
      // Salvar rascunho não exige fluxo válido — despublica se estava publicado
      await persist("draft");
      toast.success(t("Rascunho salvo."));
    } catch {
      toast.error(t("Não foi possível salvar o fluxo."));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    const found = runValidation();
    if (found.length > 0) {
      setErrorsOpen(true);
      toast.error(t("Corrija os erros antes de publicar."));
      return;
    }
    setPublishing(true);
    try {
      await persist("published");
      toast.success(t("Fluxo publicado! Ele já responde as próximas mensagens."));
    } catch {
      toast.error(t("Não foi possível publicar o fluxo."));
    } finally {
      setPublishing(false);
    }
  }

  function focusError(err: FlowValidationError) {
    if (!err.nodeId) return;
    const node = instance.getNode(err.nodeId);
    if (node) {
      instance.setCenter(node.position.x + 120, node.position.y + 60, {
        zoom: 1.1,
        duration: 350,
      });
      setSelectedId(err.nodeId);
    }
  }

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* Barra superior */}
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <Link
          href="/app/flows"
          className="focus-ring rounded-md p-1.5 text-txt-mut hover:bg-surface-hover hover:text-txt"
          aria-label={t("Voltar para a lista de fluxos")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          aria-label={t("Nome do fluxo")}
          className="focus-ring h-8 w-44 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold hover:border-line focus:border-line sm:w-64"
        />
        <Badge tone={status === "published" ? "ok" : "amber"}>
          {status === "published" ? t("Publicado") : t("Rascunho")}
        </Badge>
        {dirty && <span className="text-[11px] text-txt-dim">{t("alterações não salvas")}</span>}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={undo}
            title={t("Desfazer (Ctrl+Z)")}
            aria-label={t("Desfazer")}
            className="focus-ring rounded-md p-1.5 text-txt-mut hover:bg-surface-hover hover:text-txt"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            title={t("Refazer (Ctrl+Y)")}
            aria-label={t("Refazer")}
            className="focus-ring rounded-md p-1.5 text-txt-mut hover:bg-surface-hover hover:text-txt"
          >
            <Redo2 className="h-4 w-4" />
          </button>

          {/* Erros de validação */}
          <div className="relative">
            <button
              onClick={() => {
                runValidation();
                setErrorsOpen((v) => !v);
              }}
              className={cn(
                "focus-ring flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
                errors.length > 0
                  ? "bg-danger-soft text-danger"
                  : "text-txt-mut hover:bg-surface-hover hover:text-txt"
              )}
            >
              {errors.length > 0 ? (
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              )}
              <span className="hidden sm:inline">
                {errors.length > 0
                  ? `${errors.length} ${errors.length === 1 ? t("erro") : t("erros")}`
                  : t("Verificar")}
              </span>
            </button>
            {errorsOpen && errors.length > 0 && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setErrorsOpen(false)} aria-hidden />
                <div className="absolute right-0 z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-line bg-surface-raised py-1 shadow-pop">
                  {errors.map((err, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        focusError(err);
                        setErrorsOpen(false);
                      }}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-surface-hover"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-danger" aria-hidden />
                      <span className="text-txt-mut">{err.message}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setSelectedId(null);
              setSimulatorOpen((v) => !v);
            }}
          >
            <PlayCircle className="h-3.5 w-3.5" aria-hidden />
            {t("Testar")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void handleSave()} loading={saving}>
            <Save className="h-3.5 w-3.5" aria-hidden />
            {t("Salvar")}
          </Button>
          <Button size="sm" onClick={() => void handlePublish()} loading={publishing}>
            <Rocket className="h-3.5 w-3.5" aria-hidden />
            {t("Publicar")}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Paleta de blocos */}
        <aside className="w-48 shrink-0 overflow-y-auto border-r border-line bg-surface p-2">
          <p className="px-1 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-txt-dim">
            {t("Arraste para o canvas")}
          </p>
          <div className="space-y-1.5">
            {paletteOrder.map((type) => {
              const meta = nodeMeta[type];
              const Icon = meta.icon;
              return (
                <div
                  key={type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/pixelpage-flow", type);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDoubleClick={() => {
                    // Duplo clique adiciona no centro da viewport
                    const center = instance.screenToFlowPosition({
                      x: window.innerWidth / 2,
                      y: window.innerHeight / 2,
                    });
                    addNodeAt(type, center);
                  }}
                  title={t(meta.description)}
                  className="flex cursor-grab items-center gap-2 rounded-lg border border-line bg-surface-raised px-2.5 py-2 transition-colors hover:border-line-strong active:cursor-grabbing"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.accent }} aria-hidden />
                  <span className="truncate text-xs">{t(meta.label)}</span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Canvas */}
        <div className="min-w-0 flex-1" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => {
              setSimulatorOpen(false);
              setSelectedId(node.id);
            }}
            onPaneClick={() => setSelectedId(null)}
            defaultEdgeOptions={defaultEdgeOptions}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: false }}
            className="bg-ink"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1E2228" />
            <Controls position="bottom-left" showInteractive={false} />
          </ReactFlow>
        </div>

        {/* Painel direito: simulador ou configuração do bloco */}
        {simulatorOpen ? (
          <aside className="flex w-[360px] shrink-0 border-l border-line">
            <FlowSimulator
              flowName={name}
              getDefinition={() => toDefinition(nodes, edges)}
              onClose={() => setSimulatorOpen(false)}
            />
          </aside>
        ) : selectedNode ? (
          <aside className="w-[320px] shrink-0 overflow-hidden border-l border-line bg-surface">
            <NodeConfigPanel
              key={selectedNode.id}
              nodeId={selectedNode.id}
              nodeType={(selectedNode.type ?? "message") as FlowNodeType}
              data={selectedNode.data}
              team={team}
              units={units}
              onChange={(patch) => updateNodeData(selectedNode.id, patch)}
              onDelete={() => deleteNode(selectedNode.id)}
              onClose={() => setSelectedId(null)}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function FlowEditor({
  flow,
  team,
  units,
}: {
  flow: FlowRow;
  team: TeamOption[];
  units: UnitOption[];
}) {
  const t = useT();
  const definition = useMemo(() => {
    const raw = (flow.canvas_data ?? {}) as { nodes?: FlowNode[]; edges?: FlowEdge[] };
    return {
      nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
      edges: Array.isArray(raw.edges) ? raw.edges : [],
    } satisfies FlowDefinition;
  }, [flow.canvas_data]);

  return (
    <>
      {/* Aviso em telas pequenas — o editor precisa de espaço */}
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center md:hidden">
        <Monitor className="h-10 w-10 text-txt-mut" aria-hidden />
        <p className="max-w-xs text-sm leading-relaxed text-txt-mut">
          {t("O editor de fluxos funciona melhor no computador. Acesse pelo desktop para criar e editar seus fluxos.")}
        </p>
        <Link
          href="/app/flows"
          className="focus-ring rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-line-strong"
        >
          {t("Ver lista de fluxos")}
        </Link>
      </div>

      <div className="hidden h-full md:block">
        <ReactFlowProvider>
          <EditorInner flow={flow} initialDefinition={definition} team={team} units={units} />
        </ReactFlowProvider>
      </div>
    </>
  );
}
