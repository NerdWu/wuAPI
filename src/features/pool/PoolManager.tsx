import { useEffect, useMemo, useState, useCallback, useRef, type MouseEvent } from "react";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GripVertical, Plus, MessageSquare, RefreshCw, XCircle, X, Trash2, Check, ChevronsUpDown, Tag, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useApiAdapter } from "@/lib/useApiAdapter";
import { useTauriEvent } from "@/lib/useTauriEvent";
import { useEvent } from "@/lib/events";
import { DEFAULT_SETTINGS, type ApiEntry, type Channel, type PaginatedResult } from "@/types";
import { cn, formatResponseMs, parseResponseMs } from "@/lib/utils";
import { TestChatDialog } from "@/components/proxy/TestChatDialog";
import { getCatalogModel, getCatalogModelExact, getCatalogProviderLogo, formatTokenCount } from "@/lib/modelsCatalog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const GROUP_ORDER_STORAGE_KEY = "wuapi-pool-group-order";

function normalizeGroupName(group: string | null | undefined) {
  const trimmed = group?.trim();
  return trimmed ? trimmed : "auto";
}

function sortGroups(groups: string[], savedOrder: string[] = []) {
  const orderMap = new Map(savedOrder.map((group, index) => [group, index]));
  return [...new Set(groups.map((group) => normalizeGroupName(group)))]
    .filter(Boolean)
    .sort((a, b) => {
      if (a === "auto" && b !== "auto") return -1;
      if (b === "auto" && a !== "auto") return 1;
      const aIndex = orderMap.get(a);
      const bIndex = orderMap.get(b);
      if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
      return a.localeCompare(b);
    });
}

function StatusDot({ state }: { state: string }) {
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", {
        "bg-green-500": state === "closed",
        "bg-red-500": state === "open",
        "bg-gray-400": state === "disabled",
      })}
    />
  );
}

function formatReleaseDate(value?: string) {
  if (!value) return null;
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const monthOnly = value.match(/^(\d{4})-(\d{2})$/);
  if (monthOnly) return `${value}-01`;
  return value;
}

function parseReleaseDateForSort(entry: ApiEntry): number | null {
  const raw = entry.release_date?.trim();
  if (!raw) return null;
  const m1 = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1) return new Date(raw).getTime();
  const m2 = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return new Date(`${m2[1]}-${m2[2]}-${m2[3]}`).getTime();
  const m3 = raw.match(/^(\d{4})-(\d{2})$/);
  if (m3) return new Date(`${raw}-01`).getTime();
  return null;
}

type CatalogDisplayMeta = {
  logo: string;
  releaseDate: string;
  context: string;
  output: string;
  features: string[];
  modelMetaZh: string;
  modelMetaEn: string;
};

const zhFeatureLabels: Record<string, string> = {
  imageGeneration: "生图",
  imageUnderstanding: "识图",
  audio: "音频",
  video: "视频",
  pdf: "PDF",
  reasoning: "推理",
  interleaved: "思维链",
  toolCall: "工具调用",
  structuredOutput: "结构输出",
  attachment: "附件",
  temperature: "温度",
};
const enFeatureLabels: Record<string, string> = {
  imageGeneration: "Image Gen",
  imageUnderstanding: "Vision",
  audio: "Audio",
  video: "Video",
  pdf: "PDF",
  reasoning: "Reasoning",
  interleaved: "Reasoning Trace",
  toolCall: "Tool Calling",
  structuredOutput: "Struct Output",
  attachment: "Attachment",
  temperature: "Temperature",
};

function buildCatalogDisplayMeta(modelId: string): CatalogDisplayMeta {
  const model = getCatalogModel(modelId);
  if (!model) {
    return {
      logo: getCatalogProviderLogo(modelId),
      releaseDate: "",
      context: "",
      output: "",
      features: [],
      modelMetaZh: "",
      modelMetaEn: "",
    };
  }

  const inputs = model.modalities?.input || [];
  const outputs = model.modalities?.output || [];
  const features: string[] = [];
  if (outputs.includes("image")) features.push("imageGeneration");
  if (inputs.includes("image")) features.push("imageUnderstanding");
  if (inputs.includes("audio") || outputs.includes("audio")) features.push("audio");
  if (inputs.includes("video") || outputs.includes("video")) features.push("video");
  if (inputs.includes("pdf") || outputs.includes("pdf")) features.push("pdf");
  if (model.reasoning) features.push("reasoning");
  if (model.interleaved) features.push("interleaved");
  if (model.tool_call) features.push("toolCall");
  if (model.structured_output) features.push("structuredOutput");
  if (model.attachment) features.push("attachment");
  if (model.temperature) features.push("temperature");

  const releaseDate = formatReleaseDate(model.release_date) || "";
  const context = formatTokenCount(model.limit?.context) || "";
  const output = formatTokenCount(model.limit?.output) || "";
  const buildMeta = (
    labels: Record<string, string>,
    releaseLabel: string,
    contextLabel: string,
    outputLabel: string,
  ) => [
    releaseDate ? `${releaseLabel}: ${releaseDate}` : null,
    ...features.map((f) => labels[f]).filter(Boolean),
    context ? `${contextLabel}: ${context}` : null,
    output ? `${outputLabel}: ${output}` : null,
  ].filter(Boolean).join(" / ");

  return {
    logo: getCatalogProviderLogo(modelId),
    releaseDate,
    context,
    output,
    features,
    modelMetaZh: buildMeta(zhFeatureLabels, "发布", "上下文", "输出"),
    modelMetaEn: buildMeta(enFeatureLabels, "Release", "Context", "Output"),
  };
}

function getEntryDisplayMeta(entry: ApiEntry, catalogMap: Map<string, CatalogDisplayMeta>): CatalogDisplayMeta {
  const fallback = catalogMap.get(entry.model) || buildCatalogDisplayMeta(entry.model);
  return {
    logo: entry.provider_logo || fallback.logo || `${import.meta.env.BASE_URL}logo/custom.svg`,
    releaseDate: entry.release_date || fallback.releaseDate || "",
    context: fallback.context,
    output: fallback.output,
    features: fallback.features,
    modelMetaZh: entry.model_meta_zh || fallback.modelMetaZh || "",
    modelMetaEn: entry.model_meta_en || fallback.modelMetaEn || "",
  };
}

function ModelMetaBlock({ metaZh, metaEn, releaseDate, context, output, features }: {
  metaZh?: string;
  metaEn?: string;
  releaseDate?: string;
  context?: string;
  output?: string;
  features: string[];
}) {
  const { t, i18n } = useTranslation();
  const storedMeta = i18n.language?.startsWith("zh") ? metaZh : metaEn;
  if (storedMeta) return <div className="mt-1 text-xs leading-5 text-muted-foreground break-words">{storedMeta}</div>;
  if (!releaseDate && features.length === 0 && !context && !output) return null;
  const segments = [
    releaseDate ? `${t("apiPool.modelMeta.releaseDate")}: ${releaseDate}` : null,
    ...features,
    context ? `${t("apiPool.modelMeta.context")}: ${context}` : null,
    output ? `${t("apiPool.modelMeta.output")}: ${output}` : null,
  ].filter(Boolean) as string[];
  if (segments.length === 0) return null;
  return <div className="mt-1 text-xs leading-5 text-muted-foreground break-words">{segments.join(" / ")}</div>;
}

function getEntryStatus(entry: ApiEntry) {
  const now = Math.floor(Date.now() / 1000);
  if (entry.cooldown_until && entry.cooldown_until > now) return "open";
  if (!entry.enabled) return "disabled";
  return "closed";
}

function formatCooldownRemaining(cooldownUntil: number | null | undefined) {
  if (!cooldownUntil) return null;
  const remaining = Math.max(0, cooldownUntil - Math.floor(Date.now() / 1000));
  if (remaining <= 0) return null;
  return `${Math.ceil(remaining / 60)}m`;
}

function GroupSelector({
  value,
  groups,
  onChange,
}: {
  value: string;
  groups: string[];
  onChange: (group: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const options = useMemo(() => {
    const merged = new Set(["auto", ...groups, value || "auto"]);
    return Array.from(merged).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [groups, value]);

  const filtered = draft.trim()
    ? options.filter((item) => item.toLowerCase().includes(draft.trim().toLowerCase()))
    : options;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted"
          onClick={(event) => event.stopPropagation()}
        >
          <Tag className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start" onClick={(event) => event.stopPropagation()}>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("apiPool.group.searchPlaceholder")}
          className="mb-2 h-8 text-xs"
        />
        <div className="max-h-40 overflow-y-auto space-y-1">
          {filtered.map((group) => (
            <button
              key={group}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
                group === value && "bg-accent"
              )}
              onClick={() => {
                onChange(group);
                setDraft("");
                setOpen(false);
              }}
            >
              <Check className={cn("h-3 w-3", group === value ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{group}</span>
            </button>
          ))}
          {filtered.length === 0 && draft.trim() ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
              onClick={() => {
                onChange(draft.trim());
                setDraft("");
                setOpen(false);
              }}
            >
              <Check className="h-3 w-3 opacity-0" />
              <span className="truncate">{t("apiPool.group.create", { name: draft.trim() })}</span>
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CardBody({
  entry,
  onTest,
  onDelete,
  onToggleIntent,
  onGroupChange,
  groups,
  testingEntryIds,
  testResult,
  catalogLogo,
  catalogReleaseDate,
  catalogContext,
  catalogOutput,
  catalogFeatures,
  modelMetaZh,
  modelMetaEn,
}: {
  entry: ApiEntry;
  onTest: (entry: ApiEntry) => void;
  onDelete: (entry: ApiEntry) => void;
  onToggleIntent: (entry: ApiEntry, enabled: boolean, options: { ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }) => void;
  onGroupChange?: (entry: ApiEntry, group: string) => void;
  groups?: string[];
  testingEntryIds?: Set<string>;
  testResult?: string;
  catalogLogo: string;
  catalogReleaseDate?: string;
  catalogContext?: string;
  catalogOutput?: string;
  catalogFeatures: string[];
  modelMetaZh?: string;
  modelMetaEn?: string;
}) {
  const { t } = useTranslation();
  const [groupMenu, setGroupMenu] = useState<{ x: number; y: number } | null>(null);
  const cooldownRemaining = formatCooldownRemaining(entry.cooldown_until);

  const groupOptions = useMemo(() => {
    const merged = new Set(["auto", ...(groups ?? []), entry.group_name || "auto"]);
    return Array.from(merged).map((group) => normalizeGroupName(group));
  }, [entry.group_name, groups]);
  const speedNode = testingEntryIds?.has(entry.id) ? (
    <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
  ) : testResult === "X" || entry.response_ms === "X" ? (
    <XCircle className="h-3 w-3 text-red-500" />
  ) : testResult ? (
    <span className="text-green-600">{formatResponseMs(testResult)}</span>
  ) : entry.response_ms ? (
    <span className="text-green-600">{formatResponseMs(entry.response_ms)}</span>
  ) : null;

  return (
    <div
      className="flex min-w-0 flex-1 items-start gap-3"
      onContextMenu={(event) => {
        if (!onGroupChange || !groups?.length) return;
        event.preventDefault();
        event.stopPropagation();
        setGroupMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted/40">
        <img
          src={catalogLogo}
          alt="provider"
          className="h-6 w-6 shrink-0"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = `${import.meta.env.BASE_URL}logo/custom.svg`;
          }}
        />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <StatusDot state={getEntryStatus(entry)} />
              <span className="truncate text-sm font-medium leading-5">{entry.display_name || entry.model}</span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{entry.channel_name || "—"}</span>
            </div>
            {entry.display_name && entry.display_name !== entry.model ? (
              <div className="truncate text-[11px] text-muted-foreground">
                {t("apiPool.originalModel", { defaultValue: "原始" })}: {entry.model}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7 touch-none text-muted-foreground hover:text-foreground" onClick={() => onTest(entry)}>
              <MessageSquare className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 touch-none text-muted-foreground hover:text-red-500" onClick={() => onDelete(entry)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Switch
              checked={entry.enabled}
              onClick={(e) => {
                e.stopPropagation();
                onToggleIntent(entry, !entry.enabled, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey });
              }}
              onCheckedChange={() => {}}
              className="touch-none"
            />
          </div>
        </div>

        {cooldownRemaining ? (
          <div className="mt-1 text-xs text-red-500">
            {t("apiPool.cooldownInline", { time: cooldownRemaining })}
          </div>
        ) : null}

        <div className="mt-1 min-w-0">
          <ModelMetaBlock
            metaZh={modelMetaZh}
            metaEn={modelMetaEn}
            releaseDate={catalogReleaseDate}
            context={catalogContext}
            output={catalogOutput}
            features={catalogFeatures.map((f) => t(`apiPool.modelMeta.features.${f}`))}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-1">
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] leading-4 text-secondary-foreground">
              {entry.group_name || "auto"}
            </span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] leading-4",
                entry.enabled ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"
              )}
            >
              {entry.enabled ? t("apiPool.enabled") : t("apiPool.disabled")}
            </span>
            {catalogReleaseDate ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground">
                {catalogReleaseDate}
              </span>
            ) : null}
            {speedNode ? (
              <span className="ml-auto flex min-h-4 items-center justify-end pl-2 text-xs leading-none">
                {speedNode}
              </span>
            ) : null}
        </div>
      </div>
      {groupMenu && onGroupChange ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setGroupMenu(null)}
            aria-label="关闭分组菜单"
          />
          <div
            className="fixed z-50 min-w-36 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: groupMenu.x, top: groupMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-2 py-1.5 text-xs text-muted-foreground">切换分组</div>
            {groupOptions.map((group) => (
              <button
                key={group}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
                  normalizeGroupName(entry.group_name) === group && "bg-accent text-accent-foreground"
                )}
                onClick={() => {
                  onGroupChange(entry, group);
                  setGroupMenu(null);
                }}
              >
                <Check className={cn("h-3 w-3", normalizeGroupName(entry.group_name) === group ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{group}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
function SortablePoolEntryCard(props: {
  entry: ApiEntry;
  onTest: (entry: ApiEntry) => void;
  onDelete: (entry: ApiEntry) => void;
  onToggleIntent: (entry: ApiEntry, enabled: boolean, options: { ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }) => void;
  onGroupChange?: (entry: ApiEntry, group: string) => void;
  groups?: string[];
  testingEntryIds?: Set<string>;
  testResult?: string;
  catalogLogo: string;
  catalogReleaseDate?: string;
  catalogContext?: string;
  catalogOutput?: string;
  catalogFeatures: string[];
  modelMetaZh?: string;
  modelMetaEn?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.entry.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : undefined,
  };

  return (
    <Card ref={setNodeRef} style={style} className={cn("h-full border shadow-sm transition-opacity", !props.entry.enabled && "opacity-60")}>
      <CardContent className="flex h-full items-start gap-2 p-3">
        <div {...attributes} {...listeners} className="cursor-pointer pt-0.5 text-muted-foreground hover:text-foreground">
          <GripVertical className="h-3.5 w-3.5 shrink-0" />
        </div>
        <CardBody {...props} />
      </CardContent>
    </Card>
  );
}

function PoolEntryCard(props: {
  entry: ApiEntry;
  onTest: (entry: ApiEntry) => void;
  onDelete: (entry: ApiEntry) => void;
  onToggleIntent: (entry: ApiEntry, enabled: boolean, options: { ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }) => void;
  onGroupChange?: (entry: ApiEntry, group: string) => void;
  groups?: string[];
  testingEntryIds?: Set<string>;
  testResult?: string;
  catalogLogo: string;
  catalogReleaseDate?: string;
  catalogContext?: string;
  catalogOutput?: string;
  catalogFeatures: string[];
  modelMetaZh?: string;
  modelMetaEn?: string;
}) {
  return (
    <Card className={cn("h-full border shadow-sm transition-opacity", !props.entry.enabled && "opacity-60")}>
      <CardContent className="flex h-full items-start p-3">
        <CardBody {...props} />
      </CardContent>
    </Card>
  );
}function AddApiDialog({ open, onOpenChange, channels, channelsLoading, adapter, groups, defaultGroup }: {
open: boolean;
onOpenChange: (value: boolean) => void;
channels: Channel[];
channelsLoading: boolean;
adapter: ReturnType<typeof useApiAdapter>;
groups: string[];
defaultGroup: string;
}) {
const { t } = useTranslation();
const queryClient = useQueryClient();
const [channelId, setChannelId] = useState("");
const [modelName, setModelName] = useState("");
const [displayName, setDisplayName] = useState("");
const [groupName, setGroupName] = useState("auto");
const channelOptions = channels.filter((c) => c.enabled);

  const createMutation = useMutation({
    mutationFn: () => adapter.pool.create({
      channelId,
      model: modelName,
      displayName: displayName || undefined,
      groupName: normalizeGroupName(groupName),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      onOpenChange(false);
      setChannelId("");
      setModelName("");
      setDisplayName("");
      setGroupName("auto");
    },
    onError: (err) => toast.error(`${t("apiPool.addApi")} ${t("common.failed")}: ${err}`),
  });

  useEffect(() => {
    if (open) {
      setGroupName(normalizeGroupName(defaultGroup));
      return;
    }
    setGroupName("auto");
  }, [defaultGroup, open]);

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (!value) {
        setChannelId("");
        setModelName("");
        setDisplayName("");
        setGroupName("auto");
      }
      onOpenChange(value);
    }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("apiPool.addModel")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">{t("apiPool.channel")}</div>
            <Select value={channelId} onValueChange={(value) => {
              setChannelId(value);
              setModelName("");
              setDisplayName("");
            }}>
<SelectTrigger><SelectValue placeholder={t("apiPool.selectChannel")} /></SelectTrigger>
<SelectContent>
{channelsLoading ? (
<SelectItem value="loading" disabled>{t("common.loading")}</SelectItem>
) : channelOptions.length === 0 ? (
<SelectItem value="empty" disabled>{t("apiPool.noEnabledChannels")}</SelectItem>
) : (
channelOptions.map((channel) => <SelectItem key={channel.id} value={channel.id}>{channel.name}</SelectItem>)
)}
</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">{t("apiPool.model")}</div>
            <Input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder={t("apiPool.modelPlaceholder")} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">{t("apiPool.displayName")}</div>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("apiPool.displayNamePlaceholder")} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">{t("apiPool.groupLabel")}</div>
            <Select value={normalizeGroupName(groupName)} onValueChange={setGroupName}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortGroups(groups).map((group) => (
                  <SelectItem key={group} value={group}>
                    {group}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!channelId || !modelName || createMutation.isPending}>{t("common.add")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PoolManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const adapter = useApiAdapter();
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [filterText, setFilterText] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [testEntry, setTestEntry] = useState<ApiEntry | null>(null);
  const [testingEntryIds, setTestingEntryIds] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [testProgress, setTestProgress] = useState<{ current: number; total: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiEntry | null>(null);
  const [groupFilter, setGroupFilter] = useState<string>("auto");
  const [localGroupOrder, setLocalGroupOrder] = useState<string[]>([]);
  const [groupOrderInitialized, setGroupOrderInitialized] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupMenu, setGroupMenu] = useState<{ group: string; x: number; y: number } | null>(null);
  const [renameGroupTarget, setRenameGroupTarget] = useState<string | null>(null);
  const [renameGroupName, setRenameGroupName] = useState("");
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<string | null>(null);
  const [migrateGroupTarget, setMigrateGroupTarget] = useState<string | null>(null);
  const [migrateGroupName, setMigrateGroupName] = useState("");
  const [migrateGroupOpen, setMigrateGroupOpen] = useState(false);

  // 搜索输入 300ms 防抖，避免每次按键都触发后端请求
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilter(filterText), 300);
    return () => clearTimeout(timer);
  }, [filterText]);

  // 无限滚动分页加载 entries
  const {
    data: entriesPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["entries", "paginated", groupFilter, debouncedFilter],
    queryFn: ({ pageParam = 1 }) =>
      adapter.pool.listPaginated({
        page: pageParam,
        pageSize: 20,
        groupName: groupFilter !== "all" ? groupFilter : undefined,
        search: debouncedFilter.trim() || undefined,
      }) as Promise<PaginatedResult<ApiEntry>>,
    placeholderData: (previousData) => previousData,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.page_size < lastPage.total ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 2000,
  });

  const { data: channels, isLoading: channelsLoading } = useQuery({ queryKey: ["channels", "all"], queryFn: () => adapter.channels.list() as Promise<Channel[]>, staleTime: 2000 });

  // 分组列表从轻量接口单独拉取
  const { data: groupList } = useQuery({
    queryKey: ["groups"],
    queryFn: () => adapter.pool.getGroups() as Promise<string[]>,
    staleTime: 2000,
  });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GROUP_ORDER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setLocalGroupOrder(parsed.map((item) => normalizeGroupName(String(item))));
      }
    } catch {
      setLocalGroupOrder([]);
    }
  }, []);
  const groups = useMemo(() => {
    const vals = [...new Set([
      "auto",
      ...localGroupOrder.map((group) => normalizeGroupName(group)),
      ...(groupList ?? []).map((group) => normalizeGroupName(group)),
    ])];
    return sortGroups(vals, localGroupOrder);
  }, [groupList, localGroupOrder]);

  useEffect(() => {
    localStorage.setItem(GROUP_ORDER_STORAGE_KEY, JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    if (groupOrderInitialized) return;
    const remembered = localStorage.getItem("wuapi-default-group");
    const fallback = normalizeGroupName(
      remembered || DEFAULT_SETTINGS.active_group
    );
    setGroupFilter(fallback);
    setGroupOrderInitialized(true);
  }, [groupOrderInitialized]);

  useEffect(() => {
    if (!groupOrderInitialized) return;
    if (groups.length === 0) return;
    if (!groups.includes(groupFilter)) {
      const nextGroup = groups[0] || "auto";
      setGroupFilter(nextGroup);
    }
  }, [groupFilter, groupOrderInitialized, groups]);

  // 所有已加载的 entries 拍平
  const entries = useMemo(() => entriesPages?.pages.flatMap((p) => p.items) ?? [], [entriesPages]);

  // 无限滚动：IntersectionObserver 触发加载更多
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) fetchNextPage(); },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 过滤条件变化时清除本地排序
  useEffect(() => {
    setLocalOrder(null);
  }, [groupFilter, debouncedFilter]);

  useEffect(() => {
    if (!groupOrderInitialized) return;
    localStorage.setItem("wuapi-default-group", normalizeGroupName(groupFilter));
  }, [groupFilter, groupOrderInitialized]);

   // Desktop-only: Real-time tray reprioritisation via Tauri event.
   // This hook is a no-op on web builds (useTauriEvent returns false).
   // Event: "tray-priority-changed" 鈥?triggered when user reorders entries via system tray.
   useTauriEvent("tray-priority-changed", () => {
     queryClient.invalidateQueries({ queryKey: ["entries"] });
     queryClient.invalidateQueries({ queryKey: ["settings"] });
   });

   // Event-driven refresh: invalidate entries when the backend signals a change.
   // 300ms 防抖：避免 Tauri 事件风暴导致连续重刷查询
   const lastEntriesEvent = useRef(0);
   useEvent("entries-changed", () => {
     const now = Date.now();
     if (now - lastEntriesEvent.current < 300) return;
     lastEntriesEvent.current = now;
     queryClient.invalidateQueries({ queryKey: ["entries"] });
   });

   useEvent("channels-changed", () => {
     queryClient.invalidateQueries({ queryKey: ["channels", "all"] });
   });

  const catalogMap = useMemo(() => {
    const map = new Map<string, CatalogDisplayMeta>();
    for (const entry of entries || []) {
      if (!map.has(entry.model)) {
        const exact = getCatalogModelExact(entry.model);
        if (exact) map.set(entry.model, buildCatalogDisplayMeta(entry.model));
      }
    }
    return map;
  }, [entries]);

   const sorted = useMemo(() => {
     const list = [...(entries || [])];
     const enabled = list.filter((e) => e.enabled).sort((a, b) => a.sort_index - b.sort_index);
     const disabled = list.filter((e) => !e.enabled).sort((a, b) => a.sort_index - b.sort_index);
     return [...enabled, ...disabled];
   }, [entries]);

   const displayEntries = useMemo(() => {
      if (!localOrder) return sorted;
      const ordered = localOrder.map((id) => sorted.find((e) => e.id === id)).filter(Boolean) as ApiEntry[];
      const missing = sorted.filter((entry) => !localOrder.includes(entry.id));
      return [...ordered, ...missing];
    }, [localOrder, sorted]);

  // 过滤条件已进入 queryKey 并由后端分页接口处理，这里只消费当前页结果
  const filteredEntries = useMemo(() => displayEntries, [displayEntries]);
  // 全局排序不依赖分组/渠道筛选；仅在搜索时不可用
  const canReorder = !debouncedFilter.trim();

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => adapter.pool.reorder(orderedIds),
    onSuccess: () => {
      const scrollY = window.scrollY;
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      setLocalOrder(null);
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adapter.pool.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      setDeleteTarget(null);
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, groupName }: { id: string; groupName: string }) => adapter.pool.updateGroup(id, groupName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (err) => {
      toast.error(`${t("apiPool.group.updateFailed")}: ${err}`);
    },
  });

  const handleGroupChange = useCallback((entry: ApiEntry, group: string) => {
    updateGroupMutation.mutate({ id: entry.id, groupName: group.trim() || "auto" });
  }, [updateGroupMutation]);

  const moveWholeGroup = useCallback(async (fromGroup: string, toGroup: string) => {
    const from = normalizeGroupName(fromGroup);
    const to = normalizeGroupName(toGroup);
    const page = await adapter.pool.listPaginated({
      page: 1,
      pageSize: 10000,
      groupName: from,
    });
    await Promise.all(page.items.map((entry) => adapter.pool.updateGroup(entry.id, to)));
  }, [adapter.pool]);

  const deleteGroupMutation = useMutation({
    mutationFn: async (group: string) => {
      const target = normalizeGroupName(group);
      if (target === "auto") return;
      if ((groupList ?? []).includes(target)) {
        await moveWholeGroup(target, "auto");
      }
      return target;
    },
    onSuccess: (_unused, group) => {
      const target = normalizeGroupName(group);
      const nextOrder = groups.filter((item) => item !== target);
      setLocalGroupOrder(nextOrder);
      localStorage.setItem(GROUP_ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
      if (groupFilter === target) setGroupFilter("auto");
      setGroupMenu(null);
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (err) => toast.error(`删除分组失败: ${err}`),
  });

  const renameGroupMutation = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const source = normalizeGroupName(from);
      const target = normalizeGroupName(to);
      if (!target || source === "auto" || source === target) return { source, target };
      if ((groupList ?? []).includes(source)) {
        await moveWholeGroup(source, target);
      }
      return { source, target };
    },
    onSuccess: (result) => {
      if (!result) return;
      const { source, target } = result;
      const nextOrder = sortGroups(groups.map((group) => group === source ? target : group), localGroupOrder.map((group) => group === source ? target : group));
      setLocalGroupOrder(nextOrder);
      localStorage.setItem(GROUP_ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
      if (groupFilter === source) setGroupFilter(target);
      setRenameGroupTarget(null);
      setRenameGroupName("");
      setGroupMenu(null);
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (err) => toast.error(`重命名分组失败: ${err}`),
  });

  const migrateGroupMutation = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const source = normalizeGroupName(from);
      const target = normalizeGroupName(to);
      if (!target || source === target) return { source, target };
      await moveWholeGroup(source, target);
      return { source, target };
    },
    onSuccess: (result) => {
      if (!result) return;
      const { target } = result;
      const nextOrder = sortGroups([...groups, target], [...localGroupOrder, target]);
      setLocalGroupOrder(nextOrder);
      localStorage.setItem(GROUP_ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
      setGroupFilter(target);
      setMigrateGroupTarget(null);
      setMigrateGroupName("");
      setGroupMenu(null);
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (err) => toast.error(`迁移分组失败: ${err}`),
  });

  const groupSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleGroupDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groups.findIndex((group) => group === active.id);
    const newIndex = groups.findIndex((group) => group === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const nextOrder = arrayMove(groups, oldIndex, newIndex);
    setLocalGroupOrder(nextOrder);
  }, [groups]);

  const createLocalGroup = useCallback(() => {
    const nextGroup = normalizeGroupName(newGroupName);
    if (!nextGroup || groups.includes(nextGroup)) {
      setGroupFilter(nextGroup || "auto");
      setShowGroupDialog(false);
      setNewGroupName("");
      return;
    }
    const nextOrder = [...groups, nextGroup];
    setLocalGroupOrder(nextOrder);
    setGroupFilter(nextGroup);
    localStorage.setItem(GROUP_ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
    localStorage.setItem("wuapi-default-group", nextGroup);
    setShowGroupDialog(false);
    setNewGroupName("");
  }, [groups, newGroupName]);

const handleToggleIntent = useCallback(async (entry: ApiEntry, enabled: boolean, options: { ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }) => {
      const hotKey = options.ctrlKey || options.metaKey;
      if (options.shiftKey) {
        const targetEntries = filteredEntries;
        const targetIds = targetEntries.map((e) => e.id);
        const currentIds = localOrder ? localOrder : displayEntries.map((e) => e.id);
        // Use batch IPC to avoid N concurrent invoke calls in Tauri
        await adapter.pool.batchToggle(targetIds, enabled);
        setLocalOrder(currentIds);
        requestAnimationFrame(() => queryClient.invalidateQueries({ queryKey: ["entries"] }));
        return;
      }

      await adapter.pool.toggle(entry.id, enabled);
      if (enabled && hotKey) {
       // Move enabled entry to top of order when using hotkey (Ctrl/Cmd)
       const currentOrder = localOrder ? [...localOrder] : displayEntries.map((e) => e.id);
       const newOrder = [entry.id, ...currentOrder.filter((id) => id !== entry.id)];
       setLocalOrder(newOrder);
       reorderMutation.mutate(newOrder);
     } else {
       const currentIds = localOrder ? localOrder : displayEntries.map((e) => e.id);
       setLocalOrder(currentIds);
       requestAnimationFrame(() => queryClient.invalidateQueries({ queryKey: ["entries"] }));
     }
   }, [adapter.pool, displayEntries, filteredEntries, localOrder, queryClient, reorderMutation]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));



   const handleDragEnd = (event: DragEndEvent) => {
     if (!canReorder) return;
     const { active, over } = event;
     if (!over || active.id === over.id) return;
     const oldIndex = filteredEntries.findIndex((e) => e.id === active.id);
     const newIndex = filteredEntries.findIndex((e) => e.id === over.id);
     if (oldIndex === -1 || newIndex === -1) return;
     const newOrder = arrayMove(filteredEntries, oldIndex, newIndex);
     const newIds = newOrder.map((e) => e.id);
     const remainingIds = displayEntries.filter((entry) => !newIds.includes(entry.id)).map((entry) => entry.id);
     const mergedOrder = [...newIds, ...remainingIds];
     setLocalOrder(mergedOrder);
     reorderMutation.mutate(mergedOrder);
   };

  const testAllEntries = useCallback(async () => {
    if (!filteredEntries.length || testProgress) return;
    const scopedEntries = filteredEntries;
    const results: Record<string, string> = {};
    let completed = 0;
    const total = scopedEntries.length;
    setTestProgress({ current: 0, total });
    const grouped = new Map<string, ApiEntry[]>();
    for (const entry of scopedEntries) {
      const list = grouped.get(entry.channel_id) || [];
      list.push(entry);
      grouped.set(entry.channel_id, list);
    }
    const testChannel = async (channelEntries: ApiEntry[]) => {
      for (const entry of channelEntries) {
        setTestingEntryIds((prev) => {
          const next = new Set(prev);
          for (const e of channelEntries) next.delete(e.id);
          next.add(entry.id);
          return next;
        });
        try {
          const result = await adapter.pool.testLatency(entry.id);
          if (result.latency_ms !== null) {
            results[entry.id] = result.latency_ms.toString();
          } else {
            results[entry.id] = result.error_detail ? `X: ${result.error_detail}` : "X";
            await adapter.pool.toggle(entry.id, false); // invalidate below handles refresh for paginated query keys.
          }
        } catch (err) {
          results[entry.id] = err instanceof Error ? `X: ${err.message}` : "X";
        }
        completed++;
        setTestProgress({ current: completed, total });
        setTestResults({ ...results });
      }
    };
    await Promise.all([...grouped.values()].map(testChannel));
    setTestingEntryIds(new Set());
    setTestResults({});
    setTestProgress(null);
    queryClient.invalidateQueries({ queryKey: ["entries"] });
  }, [adapter.pool, filteredEntries, queryClient, testProgress]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-6 w-48 animate-pulse bg-muted rounded" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 w-16 animate-pulse bg-muted rounded" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4 border rounded-md">
              <div className="h-10 w-10 shrink-0 animate-pulse bg-muted rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 animate-pulse bg-muted rounded" />
                <div className="h-3 w-1/2 animate-pulse bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{t("apiPool.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("apiPool.description")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            {t("apiPool.addModel")}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowGroupDialog(true)}>
            <FolderPlus className="h-4 w-4" />
            添加分组
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={testAllEntries} disabled={!!testProgress}>
            <RefreshCw className={cn("h-4 w-4", testProgress && "animate-spin")} />
            {testProgress ? `${testProgress.current}/${testProgress.total}` : t("apiPool.testAllLatency")}
          </Button>
        </div>
      </div>
      <Card className="mt-4">
        <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative min-w-[240px] flex-1">
            <Input className="pr-8" placeholder={t("apiPool.search")} value={filterText} onChange={(e) => setFilterText(e.target.value)} />
            {filterText ? <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setFilterText("")}><X className="h-4 w-4" /></button> : null}
          </div>
        </div>
      {groups.length > 0 ? (
        <div className="border-t bg-background">
          <DndContext sensors={groupSensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
            <SortableContext items={groups} strategy={horizontalListSortingStrategy}>
              <div className="flex w-full items-center gap-1 overflow-x-auto px-1 py-1">
                {groups.map((group) => (
                  <SortableGroupTab
                    key={group}
                    group={group}
                    selected={groupFilter === group}
                    onSelect={() => setGroupFilter(group)}
                    onMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setGroupMenu({ group, x: event.clientX, y: event.clientY });
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      ) : null}
        <div className="border-t p-4">
          {!entries?.length ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">{t("apiPool.empty")}</div>
          ) : canReorder ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filteredEntries.map((e) => e.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {filteredEntries.map((entry) => {
                    const meta = getEntryDisplayMeta(entry, catalogMap);
                    return <SortablePoolEntryCard key={entry.id} entry={entry} onTest={setTestEntry} onDelete={setDeleteTarget} onToggleIntent={handleToggleIntent} onGroupChange={handleGroupChange} groups={groups} testingEntryIds={testingEntryIds} testResult={testResults[entry.id]} catalogLogo={meta.logo} catalogReleaseDate={meta.releaseDate} catalogContext={meta.context} catalogOutput={meta.output} catalogFeatures={meta.features} modelMetaZh={meta.modelMetaZh} modelMetaEn={meta.modelMetaEn} />;
                  })}
                  {/* 无限滚动 sentinel */}
                  <div ref={sentinelRef} className="h-4" />
                  {isFetchingNextPage && (
                    <div className="flex justify-center py-4 text-sm text-muted-foreground">
                      Loading...
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {filteredEntries.map((entry) => {
                const meta = getEntryDisplayMeta(entry, catalogMap);
                return <PoolEntryCard key={entry.id} entry={entry} onTest={setTestEntry} onDelete={setDeleteTarget} onToggleIntent={handleToggleIntent} onGroupChange={handleGroupChange} groups={groups} testingEntryIds={testingEntryIds} testResult={testResults[entry.id]} catalogLogo={meta.logo} catalogReleaseDate={meta.releaseDate} catalogContext={meta.context} catalogOutput={meta.output} catalogFeatures={meta.features} modelMetaZh={meta.modelMetaZh} modelMetaEn={meta.modelMetaEn} />;
              })}
              <div ref={sentinelRef} className="h-4" />
              {isFetchingNextPage && (
                <div className="flex justify-center py-4 text-sm text-muted-foreground">
                  Loading...
                </div>
              )}
            </div>
          )}
        </div>
        </CardContent>
      </Card>
      <AddApiDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        channels={channels || []}
        channelsLoading={channelsLoading}
        adapter={adapter}
        groups={groups}
        defaultGroup={groupFilter}
      />
      {groupMenu ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setGroupMenu(null)}
            aria-label="关闭分组菜单"
          />
          <div
            className="fixed z-50 w-28 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: groupMenu.x, top: groupMenu.y }}
          >
            {groupMenu.group !== "auto" ? (
              <button
                type="button"
                className="block w-full rounded px-2 py-1.5 text-center text-xs hover:bg-accent"
                onClick={() => {
                  setRenameGroupTarget(groupMenu.group);
                  setRenameGroupName(groupMenu.group);
                  setGroupMenu(null);
                }}
              >
                重命名分组
              </button>
            ) : null}
            <button
              type="button"
              className="block w-full rounded px-2 py-1.5 text-center text-xs hover:bg-accent"
              onClick={() => {
                setMigrateGroupTarget(groupMenu.group);
                setMigrateGroupName("");
                setGroupMenu(null);
              }}
            >
              迁移本组模型
            </button>
            {groupMenu.group !== "auto" ? (
            <button
              type="button"
              className="block w-full rounded px-2 py-1.5 text-center text-xs text-destructive hover:bg-accent"
              onClick={() => {
                setDeleteGroupTarget(groupMenu.group);
                setGroupMenu(null);
              }}
              disabled={deleteGroupMutation.isPending}
            >
              删除分组
            </button>
            ) : null}
          </div>
        </>
      ) : null}
      <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <DialogContent className="max-w-[360px]">
          <DialogHeader>
            <DialogTitle>添加分组</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              新分组会显示在 API 管理页顶部。添加模型或把现有模型切到该分组后，会进入当前数据库分组。
            </div>
            <Input
              autoFocus
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") createLocalGroup();
              }}
              placeholder="例如 coding / writing / auto"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGroupDialog(false)}>取消</Button>
            <Button onClick={createLocalGroup} disabled={!newGroupName.trim()}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!renameGroupTarget} onOpenChange={(open) => {
        if (!open) {
          setRenameGroupTarget(null);
          setRenameGroupName("");
        }
      }}>
        <DialogContent className="max-w-[360px]">
          <DialogHeader>
            <DialogTitle>重命名分组</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              会把该分组下的 API 条目迁移到新分组名。空分组只更新顶部标签。
            </div>
            <Input
              autoFocus
              value={renameGroupName}
              onChange={(event) => setRenameGroupName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && renameGroupTarget) {
                  renameGroupMutation.mutate({ from: renameGroupTarget, to: renameGroupName });
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameGroupTarget(null)}>取消</Button>
            <Button
              onClick={() => renameGroupTarget && renameGroupMutation.mutate({ from: renameGroupTarget, to: renameGroupName })}
              disabled={!renameGroupName.trim() || renameGroupMutation.isPending}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteGroupTarget} onOpenChange={(open) => {
        if (!open) setDeleteGroupTarget(null);
      }}>
        <DialogContent className="max-w-[360px]">
          <DialogHeader>
            <DialogTitle>删除分组</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确认删除分组 “{deleteGroupTarget}” 吗？该分组下已有 API 条目会迁移到 auto 分组。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGroupTarget(null)}>取消</Button>
            <Button
              variant="destructive"
              disabled={deleteGroupMutation.isPending}
              onClick={() => {
                if (!deleteGroupTarget) return;
                deleteGroupMutation.mutate(deleteGroupTarget, {
                  onSuccess: () => setDeleteGroupTarget(null),
                });
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!migrateGroupTarget} onOpenChange={(open) => {
        if (!open) {
          setMigrateGroupTarget(null);
          setMigrateGroupName("");
          setMigrateGroupOpen(false);
        }
      }}>
        <DialogContent className="max-w-[360px]">
          <DialogHeader>
            <DialogTitle>迁移本组模型</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              将 “{migrateGroupTarget}” 分组下的所有模型迁移到已有分组，或输入一个新分组名。
            </div>
            <div className="relative w-60 max-w-full">
              <Input
                autoFocus
                value={migrateGroupName}
                onFocus={() => setMigrateGroupOpen(true)}
                onClick={() => setMigrateGroupOpen(true)}
                onChange={(event) => {
                  setMigrateGroupName(event.target.value);
                  setMigrateGroupOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setMigrateGroupOpen(false);
                  if (event.key === "Enter" && migrateGroupTarget && migrateGroupName.trim()) {
                    migrateGroupMutation.mutate({ from: migrateGroupTarget, to: migrateGroupName });
                  }
                }}
                placeholder="选择或输入目标分组"
                className="pr-8"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setMigrateGroupOpen((value) => !value)}
                aria-label="选择目标分组"
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />
              </button>
              {migrateGroupOpen ? (
                <div className="absolute z-50 mt-1 max-h-40 w-full overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
                  {groups.filter((group) => group !== migrateGroupTarget).map((group) => (
                    <button
                      key={group}
                      type="button"
                      className="block w-full truncate rounded px-2 py-1.5 text-left hover:bg-accent"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setMigrateGroupName(group);
                        setMigrateGroupOpen(false);
                      }}
                    >
                      {group}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMigrateGroupTarget(null)}>取消</Button>
            <Button
              onClick={() => migrateGroupTarget && migrateGroupMutation.mutate({ from: migrateGroupTarget, to: migrateGroupName })}
              disabled={!migrateGroupName.trim() || normalizeGroupName(migrateGroupName) === normalizeGroupName(migrateGroupTarget) || migrateGroupMutation.isPending}
            >
              迁移
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TestChatDialog open={!!testEntry} onOpenChange={(v) => !v && setTestEntry(null)} entry={testEntry} />
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("common.deleteTitle")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("common.deleteWarning")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}>{t("common.delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableGroupTab({
  group,
  selected,
  onSelect,
  onMenu,
}: {
  group: string;
  selected: boolean;
  onSelect: () => void;
  onMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : undefined,
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1 rounded-md border border-transparent px-3 text-xs transition-colors",
        selected ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
      onClick={onSelect}
      onContextMenu={onMenu}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3 w-3 shrink-0" />
      <span className="truncate">{group}</span>
    </button>
  );
}
