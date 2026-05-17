import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Copy, Edit, Plus, RefreshCw, Save, Trash2, XCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, formatResponseMs } from '@/lib/utils';
import { getCatalogModel, getCatalogProviderLogo, formatTokenCount } from '@/lib/modelsCatalog';
import { useApiAdapter } from '../../lib/useApiAdapter';
import { useEvent } from '@/lib/events';
import { getChannelErrorMessage } from './channelErrors';
import type { PaginatedResult, ApiEntry } from '@/types';
import type { Channel, CreateChannelParams, ModelInfo, UpdateChannelParams, ModelCatalogMetaUpdate } from './types';

type ChannelFormState = {
  id?: string;
  name: string;
  api_type: string;
  base_url: string;
  api_key: string;
  notes: string;
  enabled: boolean;
};

const API_TYPES = [
  { value: 'custom', label: 'OpenAI-compatible' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'azure', label: 'Azure' },
  { value: 'responses', label: 'OpenAI Responses (Beta)' },
];

const DEFAULT_FORM: ChannelFormState = {
  name: '',
  api_type: 'custom',
  base_url: '',
  api_key: '',
  notes: '',
  enabled: true,
};

function channelToForm(channel: Channel): ChannelFormState {
  return {
    id: channel.id,
    name: channel.name,
    api_type: channel.api_type,
    base_url: channel.base_url,
    api_key: channel.api_key,
    notes: channel.notes ?? '',
    enabled: channel.enabled,
  };
}

function formatReleaseDate(value?: string) {
  if (!value) return '';
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const monthOnly = value.match(/^(\d{4})-(\d{2})$/);
  if (monthOnly) return `${value}-01`;
  return value;
}

function normalizeGroupName(value?: string | null) {
  return value?.trim() || 'auto';
}

function deriveChannelTargetGroupState(channel: Channel | null, entries?: ApiEntry[]) {
  if (!channel) return { name: 'auto', mixed: false };
  const selected = new Set((channel.selected_models || []).map((model) => model.toLowerCase()));
  if (!selected.size || !entries?.length) return { name: 'auto', mixed: false };
  const groups = Array.from(new Set(
    entries
      .filter((entry) => entry.channel_id === channel.id && selected.has(entry.model.toLowerCase()))
      .map((entry) => normalizeGroupName(entry.group_name)),
  ));
  if (groups.length === 1) {
    return { name: groups[0], mixed: false };
  }
  return { name: 'auto', mixed: groups.length > 1 };
}

function buildEntryCatalogMeta(modelName: string): ModelCatalogMetaUpdate {
  const model = getCatalogModel(modelName);
  if (!model) {
    return {
      model: modelName,
      provider_logo: getCatalogProviderLogo(modelName),
      release_date: '',
      model_meta_zh: '',
      model_meta_en: '',
    };
  }

  const inputs = model.modalities?.input || [];
  const outputs = model.modalities?.output || [];
  const features: string[] = [];
  if (outputs.includes('image')) features.push('imageGeneration');
  if (inputs.includes('image')) features.push('imageUnderstanding');
  if (inputs.includes('audio') || outputs.includes('audio')) features.push('audio');
  if (inputs.includes('video') || outputs.includes('video')) features.push('video');
  if (inputs.includes('pdf') || outputs.includes('pdf')) features.push('pdf');
  if (model.reasoning) features.push('reasoning');
  if (model.interleaved) features.push('interleaved');
  if (model.tool_call) features.push('toolCall');
  if (model.structured_output) features.push('structuredOutput');
  if (model.attachment) features.push('attachment');
  if (model.temperature) features.push('temperature');

  const releaseDate = formatReleaseDate(model.release_date);
  const context = formatTokenCount(model.limit?.context) || '';
  const output = formatTokenCount(model.limit?.output) || '';
  const zhFeatureLabels: Record<string, string> = {
    imageGeneration: '生图',
    imageUnderstanding: '识图',
    audio: '音频',
    video: '视频',
    pdf: 'PDF',
    reasoning: '推理',
    interleaved: '思维链',
    toolCall: '工具调用',
    structuredOutput: '结构输出',
    attachment: '附件',
    temperature: '温度',
  };
  const enFeatureLabels: Record<string, string> = {
    imageGeneration: 'Image Gen',
    imageUnderstanding: 'Vision',
    audio: 'Audio',
    video: 'Video',
    pdf: 'PDF',
    reasoning: 'Reasoning',
    interleaved: 'Reasoning Trace',
    toolCall: 'Tool Calling',
    structuredOutput: 'Struct Output',
    attachment: 'Attachment',
    temperature: 'Temperature',
  };
  const buildMeta = (labels: Record<string, string>, releaseLabel: string, contextLabel: string, outputLabel: string) => [
    releaseDate ? `${releaseLabel}: ${releaseDate}` : null,
    ...features.map((feature) => labels[feature]).filter(Boolean),
    context ? `${contextLabel}: ${context}` : null,
    output ? `${outputLabel}: ${output}` : null,
  ].filter(Boolean).join(' / ');

  return {
    model: modelName,
    provider_logo: getCatalogProviderLogo(modelName),
    release_date: releaseDate,
    model_meta_zh: buildMeta(zhFeatureLabels, '发布', '上下文', '输出'),
    model_meta_en: buildMeta(enFeatureLabels, 'Release', 'Context', 'Output'),
  };
}

function sortChannels(items: Channel[]): Channel[] {
  const getSortBucket = (name: string) => {
    const first = name.trim().charAt(0);
    if (/^\d$/.test(first)) return 0;
    if (/^[a-zA-Z]$/.test(first)) return 1;
    return 2;
  };

  return [...items].sort((a, b) => {
    const bucketDiff = getSortBucket(a.name) - getSortBucket(b.name);
    if (bucketDiff !== 0) return bucketDiff;
    return a.name.localeCompare(b.name, 'zh-CN', {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

export const ChannelManager: React.FC = () => {
  const { t } = useTranslation();
  const api = useApiAdapter();
  const queryClient = useQueryClient();
  const lastEntriesEvent = useRef(0);
  const {
    data: channelPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loading,
    error: queryError,
  } = useInfiniteQuery({
    queryKey: ["channels", "paginated"],
    queryFn: ({ pageParam = 1 }) =>
      api.channels.listPaginated({ page: pageParam, pageSize: 40 }) as Promise<PaginatedResult<Channel>>,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.page_size < lastPage.total ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 2000,
  });
  const { data: entries } = useQuery({
    queryKey: ["entries", "all"],
    queryFn: () => api.pool.list(),
    staleTime: 2000,
  });
  const rawChannels = useMemo(() => channelPages?.pages.flatMap((page) => page.items) ?? [], [channelPages]);
  const channels = useMemo(() => sortChannels(rawChannels), [rawChannels]);
  const entryCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries ?? []) {
      map.set(entry.channel_id, (map.get(entry.channel_id) ?? 0) + 1);
    }
    return map;
  }, [entries]);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Channel | null>(null);

  const error = queryError ? getChannelErrorMessage(queryError, t('channel.editor.listLoadFailed', '渠道列表加载失败')) : null;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) fetchNextPage(); },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEvent("channels-changed", () => {
    queryClient.invalidateQueries({ queryKey: ["channels", "paginated"] });
    queryClient.invalidateQueries({ queryKey: ["channels", "all"] });
  });

  useEvent("entries-changed", () => {
    // 300ms 防抖：避免 Tauri 事件风暴导致连续重渲染
    const now = Date.now();
    if (now - lastEntriesEvent.current < 300) return;
    lastEntriesEvent.current = now;
    queryClient.invalidateQueries({ queryKey: ["channels", "paginated"] });
    queryClient.invalidateQueries({ queryKey: ["channels", "all"] });
    queryClient.invalidateQueries({ queryKey: ["entries"] });
  });

  const refreshChannels = async () => {
    queryClient.invalidateQueries({ queryKey: ["channels", "paginated"] });
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (channel: Channel) => {
    setEditing(channel);
    setDialogOpen(true);
  };

  const handleDelete = (channel: Channel) => {
    setDeleteTarget(channel);
  };

  const confirmDeleteChannel = async () => {
    if (!deleteTarget) return;
    try {
      await api.channels.delete(deleteTarget.id);
      if (expandedId === deleteTarget.id) {
        setExpandedId(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["channels"] });
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getChannelErrorMessage(err, '删除渠道失败'));
    }
  };

  const testAllChannels = async () => {
    if (!channels) return;
    const toTest = [...channels];
    const results: Record<string, string> = {};
    for (const ch of toTest) {
      setTestingChannelId(ch.id);
      try {
        const result = await api.channels.probeUrl(ch.base_url);
        if (result.reachable) {
          const ms = String(result.latency_ms);
          await api.channels.updateResponseMs(ch.id, ms);
          results[ch.id] = ms;
        } else {
          await api.channels.update({ id: ch.id, enabled: false });
          results[ch.id] = 'X';
        }
      } catch {
        await api.channels.update({ id: ch.id, enabled: false });
        results[ch.id] = 'X';
      }
      setTestResults({ ...results });
      await new Promise((r) => setTimeout(r, 200));
    }
    setTestingChannelId(null);
    await queryClient.invalidateQueries({ queryKey: ["channels"] });
    setTestResults({});
  };

  return (
    <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{t('channel.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('channel.description')}</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t('channel.add')}
          </Button>
        </div>

        {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-24" />
              <col />
              <col className="w-16" />
              <col className="w-20" />
              <col className="w-36" />
            </colgroup>
            <thead className="bg-muted/50">
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-center font-medium">{t('channel.name')}</th>
                <th className="px-4 py-3 text-center font-medium">{t('channel.type')}</th>
                <th className="px-4 py-3 text-center font-medium">{t('channel.baseUrl')}</th>
                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1">
                    <span>{t('channel.responseTime')}</span>
                    <button
                      type="button"
                      onClick={testAllChannels}
                      disabled={testingChannelId !== null}
                      className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      title={t('channel.testAllLatency')}
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', testingChannelId !== null && 'animate-spin')} />
                    </button>
                  </div>
                </th>
                <th className="px-4 py-3 text-center font-medium">{t('channel.modelCount')}</th>
                <th className="px-4 py-3 text-center font-medium">{t('channel.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  <tr>
                    <td className="px-4 py-3">
                      <div className="h-4 w-32 animate-pulse bg-muted rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-16 animate-pulse bg-muted rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-48 animate-pulse bg-muted rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-12 animate-pulse bg-muted rounded-full" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3.5 w-3 animate-pulse bg-muted rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        <div className="h-7 w-7 animate-pulse bg-muted rounded" />
                        <div className="h-7 w-12 animate-pulse bg-muted rounded" />
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      <div className="h-4 w-28 animate-pulse bg-muted rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-14 animate-pulse bg-muted rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-44 animate-pulse bg-muted rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-12 animate-pulse bg-muted rounded-full" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3.5 w-3 animate-pulse bg-muted rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        <div className="h-7 w-7 animate-pulse bg-muted rounded" />
                        <div className="h-7 w-12 animate-pulse bg-muted rounded" />
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      <div className="h-4 w-36 animate-pulse bg-muted rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-18 animate-pulse bg-muted rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-52 animate-pulse bg-muted rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-12 animate-pulse bg-muted rounded-full" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3.5 w-3 animate-pulse bg-muted rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        <div className="h-7 w-7 animate-pulse bg-muted rounded" />
                        <div className="h-7 w-12 animate-pulse bg-muted rounded" />
                      </div>
                    </td>
                  </tr>
                </>
              ) : channels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{t('channel.editor.channelListEmpty')}</td>
                </tr>
              ) : (
                channels.map((channel) => (
                  <ChannelRow
                    key={channel.id}
                    channel={channel}
                    allChannels={channels}
                    expanded={expandedId === channel.id}
                    onToggle={() => setExpandedId((current) => (current === channel.id ? null : channel.id))}
                    onEdit={() => openEdit(channel)}
                    onDelete={() => handleDelete(channel)}
                    onChanged={refreshChannels}
                    testingChannelId={testingChannelId}
                    testResults={testResults}
                    entryCountMap={entryCountMap}
                  />

                ))
              )}
            </tbody>
          </table>
          <div ref={sentinelRef} className="h-4" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-4 text-sm text-muted-foreground">Loading...</div>
          )}
        </div>

        <ChannelEditorDialog
          open={dialogOpen}
          channel={editing}
          onOpenChange={setDialogOpen}
          onSaved={refreshChannels}
        />
        <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("common.deleteTitle")}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{t("common.deleteWarning")}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button>
              <Button variant="destructive" disabled={false} onClick={confirmDeleteChannel}>{t("common.delete")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
};

function ChannelRow({
  channel,
  allChannels,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onChanged,
  testingChannelId,
  testResults,
  entryCountMap,
}: {
  channel: Channel;
  allChannels: Channel[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => Promise<void>;
  testingChannelId?: string | null;
  testResults?: Record<string, string>;
  entryCountMap?: Map<string, number>;
}) {
  const { t } = useTranslation();
  const api = useApiAdapter();
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [copying, setCopying] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const availableModels = channel.available_models ?? [];
  const selectedModels = channel.selected_models ?? [];

  const stripCircleSuffix = (name: string): string => name.replace(/[\u2460-\u2473]+$/, '');

  const nextCircleName = (baseName: string): string => {
    const circles = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
    const used = new Set<number>();

    for (const item of allChannels) {
      if (stripCircleSuffix(item.name) !== baseName) continue;
      const suffix = item.name.slice(baseName.length);
      if (!suffix) {
        used.add(0);
        continue;
      }
      for (const char of suffix) {
        const index = circles.indexOf(char);
        if (index >= 0) used.add(index + 1);
      }
    }

    for (let n = 1; n <= circles.length; n += 1) {
      if (!used.has(n)) return `${baseName}${circles[n - 1]}`;
    }

    return `${baseName} (${used.size})`;
  };

  const copyChannel = async () => {
    setCopying(true);
    setRowError(null);
    try {
      const baseName = stripCircleSuffix(channel.name);
      const created = await api.channels.create({
        name: nextCircleName(baseName),
        api_type: channel.api_type,
        base_url: channel.base_url,
        api_key: '',
        notes: channel.notes ?? '',
      });
      await api.channels.update({ id: created.id, enabled: false });
      await onChanged();
      toast.success(t('channel.copySuccess', { name: created.name }));
    } catch (err) {
      const message = getChannelErrorMessage(err, t('channel.copyFailed', '复制渠道失败'));
      setRowError(message);
      toast.error(message);
    } finally {
      setCopying(false);
    }
  };

  const toggleEnabled = async () => {
    setSaving(true);
    setRowError(null);
    try {
      await api.channels.update({ id: channel.id, enabled: !channel.enabled });
      await onChanged();
    } catch (err) {
      const msg = (err && typeof err === 'object' && 'message' in err) ? String((err as {message:unknown}).message) : String(err);
      console.error('[toggleEnabled]', err);
      toast.error(msg || t('channel.editor.saveStatusFailed', '保存渠道状态失败'));
    } finally {
      setSaving(false);
    }
  };

  const probeUrl = async () => {
    setProbing(true);
    setProbeResult(null);
    setRowError(null);
    try {
      const result = await api.channels.probeUrl(channel.base_url);
      setProbeResult(`${result.latency_ms}ms`);
    } catch (err) {
      setRowError(getChannelErrorMessage(err, t('channel.editor.probeFailed', '测速失败')));
    } finally {
      setProbing(false);
    }
  };

  const fetchModels = async () => {
    setFetching(true);
    setRowError(null);
    try {
      await api.channels.fetchModels(channel.id);
      await onChanged();
    } catch (err) {
      setRowError(getChannelErrorMessage(err, t('channel.editor.fetchModelsFailed', '获取模型列表失败')));
    } finally {
      setFetching(false);
    }
  };

  const syncSelection = async (modelNames: string[]) => {
    setSaving(true);
    setRowError(null);
    try {
      await api.channels.selectModels(channel.id, modelNames, availableModels, []);
      await onChanged();
    } catch (err) {
      setRowError(getChannelErrorMessage(err, t('channel.editor.syncFailed', '同步 API 池失败')));
    } finally {
      setSaving(false);
    }
  };

  const toggleModel = (modelName: string) => {
    const next = selectedModels.includes(modelName)
      ? selectedModels.filter((item) => item !== modelName)
      : [...selectedModels, modelName];
    syncSelection(next);
  };

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/30 cursor-pointer" onClick={onToggle}>
        <td className="min-w-0 px-4 py-3 text-center">
          <div className="max-w-full">
            <div className="flex items-center justify-center gap-1 font-medium">
              <span className="min-w-0 whitespace-normal break-words">{channel.name}</span>
              {channel.notes && (
                <span title={channel.notes}>
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{channel.api_type}</span>
        </td>
        <td className="min-w-0 px-4 py-3 text-center text-xs" title={channel.base_url}>
          <div className="whitespace-normal break-all">{channel.base_url}</div>
        </td>
        <td className="px-2 py-3 text-center text-xs text-muted-foreground whitespace-nowrap">
          <div className="flex min-h-5 items-center justify-center">
          {testingChannelId === channel.id ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (() => {
            const testValue = testResults?.[channel.id];
            const persistedValue = channel.response_ms ? String(channel.response_ms) : '';
            const displayValue = testValue && testValue !== 'X' && persistedValue !== testValue
              ? testValue
              : persistedValue;

            if (testValue === 'X' && !persistedValue) {
              return <span className="text-red-500" title={t('common.failed')}><XCircle className="h-3.5 w-3.5" /></span>;
            }

            if (displayValue) {
              return <span className="text-green-600">{formatResponseMs(displayValue)}</span>;
            }

            return <span className="text-red-500" title={t('channel.testAllLatency')}><XCircle className="h-3.5 w-3.5" /></span>;
          })()}
          </div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-center">{selectedModels.length || entryCountMap?.get(channel.id) || 0} / {availableModels.length}</td>
        <td className="px-4 py-3">
          <div className="flex justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(event) => { event.stopPropagation(); onEdit(); }} title={t('common.edit')}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(event) => { event.stopPropagation(); copyChannel(); }} disabled={copying} title={t('channel.copy')}>
              <Copy className="h-4 w-4" />
            </Button>
            <div className="flex h-8 w-8 items-center justify-center" onClick={(event) => event.stopPropagation()}>
              <Checkbox
                checked={channel.enabled}
                onCheckedChange={() => toggleEnabled()}
                disabled={saving}
                className="h-4 w-4 data-[state=checked]:border-green-600 data-[state=checked]:bg-green-600 data-[state=checked]:text-white"
              />
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(event) => { event.stopPropagation(); onDelete(); }} title={t('common.delete')}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </td>
      </tr>

      {expanded ? (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid gap-3 text-sm lg:grid-cols-[minmax(220px,320px)_1fr]">
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">{t('channel.notes')}</div>
                  {channel.notes ? (
                    <pre className="max-h-28 whitespace-pre-wrap break-all text-xs leading-5">{channel.notes}</pre>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('common.noData')}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={(event) => { event.stopPropagation(); probeUrl(); }}
                    disabled={probing}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', probing && 'animate-spin')} />
                    {t('channel.testAllLatency')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={(event) => { event.stopPropagation(); fetchModels(); }}
                    disabled={fetching}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', fetching && 'animate-spin')} />
                    {t('channel.editor.fetchModels')}
                  </Button>
                </div>
                {(probeResult || rowError) && (
                  <div className={cn('text-xs', rowError ? 'text-destructive' : 'text-green-600')}>
                    {rowError || `${t('channel.responseTime')}: ${probeResult}`}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-border bg-background">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {t('channel.editor.modelsTitle', { count: availableModels.length })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('channel.editor.modelsSelected', { count: selectedModels.length })}
                  </div>
                </div>
                {availableModels.length ? (
                  <div className="grid max-h-56 gap-0 overflow-y-auto p-2 sm:grid-cols-2 xl:grid-cols-3">
                    {availableModels.map((model) => (
                      <label
                        key={model.name}
                        className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedModels.includes(model.name)}
                          onCheckedChange={() => toggleModel(model.name)}
                          disabled={saving}
                        />
                        <span className="truncate" title={model.name}>{model.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t('channel.editor.modelsEmpty')}</div>
                )}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ChannelEditorDialog({
  open,
  channel,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  channel: Channel | null;
  onOpenChange: (value: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const api = useApiAdapter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ChannelFormState>(DEFAULT_FORM);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsValidated, setModelsValidated] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [targetGroupName, setTargetGroupName] = useState('auto');
  const [targetGroupDirty, setTargetGroupDirty] = useState(false);
  const [initialTargetGroupName, setInitialTargetGroupName] = useState('auto');
  const [initialTargetGroupMixed, setInitialTargetGroupMixed] = useState(false);
  const [targetGroupOpen, setTargetGroupOpen] = useState(false);
  const [urlProbe, setUrlProbe] = useState<{ reachable: boolean; latency_ms: number; status_code?: number; detected_type?: string; message: string } | null>(null);
  const [probingUrl, setProbingUrl] = useState(false);
  const [endpointVerified, setEndpointVerified] = useState(false);
  const [endpointVerificationMessage, setEndpointVerificationMessage] = useState<string | null>(null);
  const [saveStage, setSaveStage] = useState<string | null>(null);

  const probeSeqRef = React.useRef(0);
  const [saving, setSaving] = useState(false);

  const isEdit = !!channel;
  const { data: entries } = useQuery({
    queryKey: ['entries', 'all'],
    queryFn: () => api.pool.list(),
    staleTime: 2000,
    enabled: open,
  });
  const { data: poolGroups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.pool.getGroups(),
    staleTime: 2000,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setAvailableModels([]);
    setSelectedModels([]);
    setTargetGroupOpen(false);
    setTargetGroupDirty(false);
    setModelSearch('');
    setEndpointVerified(false);
    setEndpointVerificationMessage(null);
    setModelsValidated(!!channel && ((channel.available_models?.length || 0) > 0));
    if (channel) {
      const groupState = deriveChannelTargetGroupState(channel, entries);
      setForm(channelToForm(channel));
      setAvailableModels(channel.available_models || []);
      setSelectedModels(channel.selected_models || []);
      setInitialTargetGroupName(groupState.name);
      setInitialTargetGroupMixed(groupState.mixed);
      setTargetGroupName(groupState.name);
    } else {
      setForm(DEFAULT_FORM);
      setInitialTargetGroupName('auto');
      setInitialTargetGroupMixed(false);
      setTargetGroupName('auto');
    }
  }, [channel, entries, open]);

  useEffect(() => {
    const seq = ++probeSeqRef.current;
    if (!form.base_url.trim()) {
      setUrlProbe(null);
      setProbingUrl(false);
      return;
    }
    setUrlProbe(null);
    setProbingUrl(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api.channels.probeUrl(form.base_url.trim());
        if (probeSeqRef.current === seq) {
          setUrlProbe(result as { reachable: boolean; latency_ms: number; status_code?: number; detected_type?: string; message: string });
          setEndpointVerificationMessage(result.reachable
            ? t('channel.editor.endpointReachable', { message: result.message, defaultValue: `端点可达：${result.message}` })
            : t('channel.editor.endpointUnreachable', { message: result.message, defaultValue: `端点不可达：${result.message}` }));
        }
      } catch {
        if (probeSeqRef.current === seq) {
          setUrlProbe({ reachable: false, status_code: undefined, latency_ms: 0, detected_type: undefined, message: t('channel.editor.probeFailedGeneric', 'Probe failed') });
          setEndpointVerificationMessage(t('channel.editor.endpointProbeFailed', '端点校对失败'));
        }
      } finally {
        if (probeSeqRef.current === seq) {
          setProbingUrl(false);
        }
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [api, form.base_url, t]);

  const canSave = !!(form.name.trim() && form.base_url.trim() && form.api_key.trim());

  const setValue = <K extends keyof ChannelFormState>(key: K, value: ChannelFormState[K]) => {
    if (key === 'api_type' || key === 'base_url' || key === 'api_key') {
      setEndpointVerified(false);
      setEndpointVerificationMessage(null);
      setModelsValidated(false);
      setUrlProbe(null);
      setAvailableModels([]);
      setSelectedModels([]);
    }
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleApiTypeChange = (type: string) => {
    setForm((prev) => ({
      ...prev,
      api_type: type,
      base_url: prev.base_url,
    }));
    setAvailableModels([]);
    setSelectedModels([]);
    setEndpointVerified(false);
    setEndpointVerificationMessage(null);
    setModelsValidated(false);
  };

  const handleFetchModels = async () => {
    if (probingUrl) {
      toast.error(t('channel.editor.probingInProgress', 'URL 还在检测中，请稍后再试'));
      return;
    }

    let probe = urlProbe;
    if (!probe) {
      setProbingUrl(true);
      try {
        probe = await api.channels.probeUrl(form.base_url.trim()) as { reachable: boolean; latency_ms: number; status_code?: number; detected_type?: string; message: string };
        setUrlProbe(probe);
      } catch {
        probe = { reachable: false, status_code: undefined, latency_ms: 0, detected_type: undefined, message: t('channel.editor.probeFailedGeneric', 'Probe failed') };
        setUrlProbe(probe);
      } finally {
        setProbingUrl(false);
      }
    }

    if (!probe.reachable) {
      toast.error(t('channel.editor.urlUnreachable', { message: probe.message, defaultValue: `URL 不可达：${probe.message}` }));
      return;
    }

    setFetchingModels(true);
    setModelsValidated(false);
    try {
      const result = await api.channels.fetchModelsDirect(form.api_type, form.base_url, form.api_key, false);
      setForm((prev) => ({
        ...prev,
        api_type: result.detected_type,
        base_url: result.corrected_base_url || prev.base_url,
      }));
      setEndpointVerified(true);
      setEndpointVerificationMessage(t('channel.editor.endpointVerifiedMessage', { type: result.detected_type.toUpperCase(), defaultValue: `端点校对通过，已识别为 ${result.detected_type.toUpperCase()}` }));
      setModelsValidated(true);
      const normalizedModels: ModelInfo[] = (result.models || []).map((item, index) => ({
        id: String(item.id ?? item.name ?? index),
        name: String(item.name ?? ''),
        owned_by: typeof item.owned_by === 'string' ? item.owned_by : undefined,
      })).filter((item) => item.name);
      setAvailableModels(normalizedModels);
      const existingSelected = new Set((channel?.selected_models || []).map((item) => item.toLowerCase()));
      setSelectedModels(channel ? normalizedModels.filter((model) => existingSelected.has(model.name.toLowerCase())).map((model) => model.name) : []);
    } catch (err) {
        toast.error(getChannelErrorMessage(err, t('channel.editor.fetchModelsFailed', '获取模型列表失败')));
    } finally {
      setFetchingModels(false);
    }
  };

  const toggleModel = (modelName: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelName)
        ? prev.filter((m) => m !== modelName)
        : [...prev, modelName],
    );
  };

  const selectAllFiltered = () => {
    const filtered = modelSearch
      ? availableModels.filter((m) => m.name.toLowerCase().includes(modelSearch.toLowerCase()))
      : availableModels;
    const names = filtered.map((m) => m.name);
    setSelectedModels((prev) => Array.from(new Set([...prev, ...names])));
  };

  const clearAllSelected = () => {
    setSelectedModels([]);
  };

  const syncSelectedModelsToGroup = async (channelId: string, groupName: string) => {
    const targetGroup = groupName.trim() || 'auto';
    const selected = new Set(selectedModels.map((model) => model.toLowerCase()));
    if (!selected.size) return;
    const entries = await api.pool.list();
    await Promise.all(
      entries
        .filter((entry) => entry.channel_id === channelId && selected.has(entry.model.toLowerCase()))
        .map((entry) => api.pool.updateGroup(entry.id, targetGroup)),
    );
  };

  const shouldSyncTargetGroup = !isEdit || targetGroupDirty || !initialTargetGroupMixed;

  const handleSave = async () => {
    if (saving || fetchingModels) return;
    if (!canSave) {
      toast.error(t('channel.editor.requiredFieldsHint', '请填写渠道名称、Base URL 和 API Key 后再保存'));
      return;
    }
    setSaving(true);
    setSaveStage(t('channel.editor.savingStart', '开始保存渠道...'));
    try {
      let channelId = form.id;
      if (channelId) {
        setSaveStage(t('channel.editor.updating', '正在更新渠道信息...'));
        const params: UpdateChannelParams = {
          id: channelId,
          name: form.name,
          api_type: form.api_type,
          base_url: form.base_url,
          api_key: form.api_key,
          notes: form.notes,
          enabled: form.enabled,
        };
        await api.channels.update(params);
      } else {
        setSaveStage(t('channel.editor.creating', '正在创建渠道...'));
        const params: CreateChannelParams = {
          name: form.name,
          api_type: form.api_type,
          base_url: form.base_url,
          api_key: form.api_key,
          notes: form.notes,
        };
        const saved = await api.channels.create(params);
        channelId = saved.id;
      }

      if (urlProbe?.reachable && urlProbe.latency_ms > 0 && channelId) {
        try {
          setSaveStage(t('channel.editor.writingResponseMs', '正在写入响应时间...'));
          await api.channels.updateResponseMs(channelId, String(urlProbe.latency_ms));
        } catch (err) {
          toast.error(getChannelErrorMessage(err, t('channel.editor.responseWriteFailed', '渠道已保存，但响应时间写入失败')));
          return;
        }
      }

      // Always sync selected models to handle additions and deletions reliably.
      if (channelId) {
        try {
          setSaveStage(t('channel.editor.syncingModels', '正在同步所选模型...'));
          await Promise.race([
            api.channels.selectModels(
              channelId,
              selectedModels,
              availableModels,
              selectedModels.map(buildEntryCatalogMeta),
            ),
            new Promise((_, reject) => setTimeout(() => reject(new Error(t('channel.editor.syncTimeout', '模型同步超时'))), 10000)),
          ]);
          if (shouldSyncTargetGroup) {
            await syncSelectedModelsToGroup(channelId, targetGroupName);
          }
        } catch (err) {
          toast.error(getChannelErrorMessage(err, t('channel.editor.modelSyncFailed', '渠道已保存，但模型同步失败')));
          return;
        }
      }

      setSaveStage(t('channel.editor.refreshingData', '正在刷新数据...'));
      await onSaved();
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      setSaveStage(t('channel.editor.closingWindow', '正在关闭窗口...'));
      onOpenChange(false);
    } catch (err) {
      toast.error(getChannelErrorMessage(err, t('channel.editor.saveFailed', '保存渠道失败')));
    } finally {
      setSaveStage(null);
      setSaving(false);
    }
  };

  const handleClose = () => {
    queryClient.invalidateQueries({ queryKey: ['channels'] });
    queryClient.invalidateQueries({ queryKey: ['entries'] });
    onOpenChange(false);
  };

  const filteredModels = modelSearch
    ? availableModels.filter((m) => m.name.toLowerCase().includes(modelSearch.toLowerCase()))
    : availableModels;
  const groupOptions = useMemo(() => Array.from(new Set(['auto', ...(poolGroups || [])])), [poolGroups]);

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (!value) setSaving(false);
      if (!value) {
        queryClient.invalidateQueries({ queryKey: ['channels'] });
        queryClient.invalidateQueries({ queryKey: ['entries'] });
      }
      onOpenChange(value);
    }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="pr-8">
          <div className="flex min-w-0 items-center gap-3">
            <DialogTitle className="shrink-0">{channel ? t('channel.editor.editTitle') : t('channel.editor.title')}</DialogTitle>
            {endpointVerificationMessage ? (
              <div className="min-w-0 truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                {endpointVerificationMessage}
              </div>
            ) : null}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="space-y-4 pb-4">
            {saveStage && <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{saveStage}</div>}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('channel.editor.channelName')}</Label>
                <Input value={form.name} onChange={(event) => setValue('name', event.target.value)} placeholder={t('channel.form.placeholderName')} />
              </div>
              <div className="space-y-2">
                <Label>{t('channel.editor.apiType')}</Label>
                <Select value={form.api_type} onValueChange={handleApiTypeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {API_TYPES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('channel.editor.baseUrl')}</Label>
                <div className="relative">
                  <Input
                    value={form.base_url}
                    onChange={(event) => setValue('base_url', event.target.value)}
                    placeholder={t('channel.form.placeholderBaseUrl')}
                    className={urlProbe ? (urlProbe.reachable ? 'pr-24 border-green-500/50 focus-visible:ring-green-500/30' : 'pr-24 border-red-500/50 focus-visible:ring-red-500/30') : 'pr-8'}
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                    {probingUrl ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : urlProbe?.reachable ? (
                      <span className="text-[10px] text-green-600 font-medium whitespace-nowrap">{urlProbe.latency_ms}ms ✓</span>
                    ) : urlProbe ? (
                      <span className="text-[10px] text-red-500" title={urlProbe.message}>✗</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('channel.editor.apiKey')}</Label>
                <Input type="text" value={form.api_key} onChange={(event) => setValue('api_key', event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('channel.editor.notes')}</Label>
                <Input value={form.notes} onChange={(event) => setValue('notes', event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>入驻分组</Label>
                <div className="space-y-2">
                  {initialTargetGroupMixed ? (
                    <div className="text-xs text-muted-foreground">
                      当前所选模型分散在多个分组；仅在你主动修改此字段后才会统一迁移。
                    </div>
                  ) : null}
                  <div className="relative w-full">
                    <Input
                      value={targetGroupName}
                      onFocus={() => setTargetGroupOpen(true)}
                      onClick={() => setTargetGroupOpen(true)}
                      onChange={(event) => {
                        setTargetGroupName(event.target.value);
                        setTargetGroupDirty(true);
                        setTargetGroupOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setTargetGroupOpen(false);
                      }}
                      placeholder="auto 或输入新分组"
                      className="pr-8"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setTargetGroupOpen((value) => !value)}
                      aria-label="选择入驻分组"
                    >
                      ▾
                    </button>
                    {targetGroupOpen ? (
                      <div className="absolute z-50 mt-1 grid max-h-40 w-full grid-cols-2 gap-1 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
                        {groupOptions.map((group) => (
                          <button
                            key={group}
                            type="button"
                            className="block w-full truncate rounded px-2 py-1.5 text-left hover:bg-accent"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setTargetGroupName(group);
                              setTargetGroupDirty(group !== initialTargetGroupName || initialTargetGroupMixed);
                              setTargetGroupOpen(false);
                            }}
                          >
                            {group}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="space-y-3 pt-4 border-t">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-24 shrink-0">
                <div className="text-sm font-medium">
                  {availableModels.length > 0 ? t('channel.editor.modelsTitle', { count: availableModels.length }) : t('channel.editor.modelsEmpty')}
                </div>
                {availableModels.length > 0 ? (
                  <div className="text-xs text-muted-foreground">{t('channel.editor.modelsSelected', { count: selectedModels.length })}</div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {modelsValidated ? t('channel.editor.modelsEmptyVerified') : endpointVerified ? t('channel.editor.modelsEmptyVerified2') : t('channel.editor.modelsEmptyNote')}
                  </div>
                )}
              </div>
              <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
                <Input placeholder={t('channel.editor.searchPlaceholder')} value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} className="h-8 min-w-36 max-w-56 flex-1 text-sm" />
                <Button size="sm" variant="outline" className="h-8 shrink-0 px-2 text-xs" onClick={selectAllFiltered}>全选列表</Button>
                <Button size="sm" variant="outline" className="h-8 shrink-0 px-2 text-xs" onClick={clearAllSelected}>{t('channel.editor.clearSelected')}</Button>
              </div>
              <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 px-2 text-xs" onClick={handleFetchModels} disabled={!canSave || probingUrl || urlProbe?.reachable === false || fetchingModels}>
                <RefreshCw className={cn('h-3.5 w-3.5', fetchingModels && 'animate-spin')} />
                {fetchingModels ? t('channel.editor.fetching') : '获取模型'}
              </Button>
            </div>

            {availableModels.length > 0 ? (
              <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background p-2">
                <div className="grid gap-1 sm:grid-cols-2">
                  {filteredModels.map((model) => (
                    <label key={model.id || model.name} className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                      <Checkbox checked={selectedModels.includes(model.name)} onCheckedChange={() => toggleModel(model.name)} />
                      <span className="min-w-0 flex-1 truncate" title={model.name}>{model.name}</span>
                      {model.owned_by ? <span className="shrink-0 text-xs text-muted-foreground">{model.owned_by}</span> : null}
                    </label>
                  ))}
                </div>
              </div>
) : (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                {modelsValidated ? t('channel.editor.emptyPlaceholder2') : t('channel.editor.emptyPlaceholder')}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving || fetchingModels}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving || fetchingModels} className="gap-1.5">
            <Save className="h-4 w-4" />
            {saving ? t('channel.editor.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className={cn('break-all text-sm', mono && 'font-mono text-xs')}>{value}</div>
    </div>
  );
}
