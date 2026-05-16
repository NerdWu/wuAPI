import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useApiAdapter } from "@/lib/useApiAdapter";
import type { DashboardFilter } from "@/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#ec4899",
  "#64748b",
];

const CHART_TEXT_STYLE = {
  fontFamily: "inherit",
  fontSize: 14,
  fill: "hsl(var(--muted-foreground))",
};
const CHART_MARGIN = { top: 8, right: 18, left: 0, bottom: 2 };
const TOOLTIP_STYLE = {
  fontFamily: "inherit",
  borderRadius: 10,
  border: "1px solid hsl(var(--border))",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
};

type SeriesPoint = {
  time: string;
  [key: string]: string | number;
};

const toMillion = (value: number) => value / 1_000_000;
const formatMillion = (value: number) => `${toMillion(value).toFixed(2)} M`;

function buildSeriesData(
  items: Array<{ time: string; model: string; value: number }> | undefined,
  topN = 8,
): { data: SeriesPoint[]; series: string[] } {
  if (!items?.length) return { data: [], series: [] };

  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.model, (totals.get(item.model) ?? 0) + item.value);
  }

  const series = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([model]) => model);
  const allowed = new Set(series);
  const byTime = new Map<string, SeriesPoint>();

  for (const item of items) {
    const timeEntry = byTime.get(item.time) ?? { time: item.time };
    const key = allowed.has(item.model) ? item.model : "Other";
    const current = typeof timeEntry[key] === "number" ? Number(timeEntry[key]) : 0;
    timeEntry[key] = current + toMillion(item.value);
    byTime.set(item.time, timeEntry);
  }

  const finalSeries = byTime.size && items.some((item) => !allowed.has(item.model))
    ? [...series, "Other"]
    : series;

  return {
    data: [...byTime.values()].sort((a, b) => String(a.time).localeCompare(String(b.time))),
    series: finalSeries,
  };
}

function StatCard({ title, value, totalLabel }: { title: string; value: number | string; totalLabel?: string }) {
  const displayValue = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <Card className="rounded-xl">
      <CardContent className="px-3 py-2.5">
        <p className="text-sm text-muted-foreground leading-tight">{title}</p>
        <p className="mt-1 text-2xl font-bold leading-7">
          {displayValue}
        </p>
        {totalLabel !== undefined ? (
          <p className="mt-1 text-xs leading-tight text-muted-foreground">
            {totalLabel}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const api = useApiAdapter();
  const [filter, setFilter] = useState<DashboardFilter>({ granularity: "hour" });
  const [visibleCount, setVisibleCount] = useState(24);

  const { data: stats } = useQuery({
    queryKey: ["dashboardStats", filter],
    queryFn: () => api.usage.getDashboardStats(filter),
  });

  const { data: consumption } = useQuery({
    queryKey: ["modelConsumption", filter],
    queryFn: () => api.usage.getModelConsumption(filter),
  });

  const totalTokens = (stats?.total_prompt_tokens ?? 0) + (stats?.total_completion_tokens ?? 0);
  const todayTokens = (stats?.today_prompt_tokens ?? 0) + (stats?.today_completion_tokens ?? 0);
  const consumptionSeries = buildSeriesData(consumption);
  const visibleConsumptionData = useMemo(() => {
    const count = Math.max(5, Math.min(visibleCount, consumptionSeries.data.length || visibleCount));
    return consumptionSeries.data.slice(-count);
  }, [consumptionSeries.data, visibleCount]);

  return (
    <div className="flex h-full min-h-0 flex-col p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("dashboard.title")}</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t("dashboard.filter.hour")}</span>
          <Switch
            checked={filter.granularity === "day"}
            onCheckedChange={(checked) => {
              setVisibleCount(30);
              setFilter((prev) => ({
                ...prev,
                granularity: checked ? "day" : "hour",
              }));
            }}
          />
          <span>{t("dashboard.filter.day")}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <StatCard
          title={t("dashboard.cards.todayRequests")}
          value={stats?.today_requests ?? 0}
          totalLabel={`${t("dashboard.cards.total")}: ${(stats?.total_requests ?? 0).toLocaleString()}`}
        />
        <StatCard
          title={t("dashboard.cards.todayTokens")}
          value={formatMillion(todayTokens)}
          totalLabel={`${t("dashboard.cards.total")}: ${formatMillion(totalTokens)}`}
        />
        <StatCard
          title={t("dashboard.cards.todayPrompt")}
          value={formatMillion(stats?.today_prompt_tokens ?? 0)}
          totalLabel={`${t("dashboard.cards.total")}: ${formatMillion(stats?.total_prompt_tokens ?? 0)}`}
        />
        <StatCard
          title={t("dashboard.cards.todayCompletion")}
          value={formatMillion(stats?.today_completion_tokens ?? 0)}
          totalLabel={`${t("dashboard.cards.total")}: ${formatMillion(stats?.total_completion_tokens ?? 0)}`}
        />
      </div>

      <Card className="relative mt-6 min-h-0 flex-1 overflow-hidden rounded-xl">
        <div className="absolute left-4 right-4 top-3 z-10 flex max-h-12 flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden text-xs text-muted-foreground">
          {consumptionSeries.series.map((series, index) => (
            <div key={series} className="flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <span className="truncate">{series}</span>
            </div>
          ))}
        </div>
        <CardContent
          className="h-full px-2 pb-1 pt-14"
          onWheel={(event) => {
            event.preventDefault();
            setVisibleCount((prev) => {
              const total = consumptionSeries.data.length || prev;
              return event.deltaY < 0 ? Math.max(5, prev - 5) : Math.min(total, prev + 5);
            });
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visibleConsumptionData} margin={CHART_MARGIN} barCategoryGap="12%" barGap={0}>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} opacity={0.35} />
              <XAxis
                dataKey="time"
                tick={CHART_TEXT_STYLE}
                axisLine={{ stroke: "#111827", strokeWidth: 1.5 }}
                tickLine={{ stroke: "#111827", strokeWidth: 1 }}
                minTickGap={24}
              />
              <YAxis
                tick={CHART_TEXT_STYLE}
                axisLine={{ stroke: "#111827", strokeWidth: 1.5 }}
                tickLine={{ stroke: "#111827", strokeWidth: 1 }}
                width={44}
                tickFormatter={(value) => Number(value).toFixed(2)}
              />
              <Tooltip
                shared={false}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={CHART_TEXT_STYLE}
                itemStyle={CHART_TEXT_STYLE}
                formatter={(value: unknown, name: unknown) => [`${Number(value).toFixed(2)} M`, String(name)]}
              />
              {consumptionSeries.series.map((series, index) => (
                <Bar
                  key={series}
                  dataKey={series}
                  stackId="consumption"
                  fill={COLORS[index % COLORS.length]}
                  radius={0}
                  minPointSize={4}
                  maxBarSize={86}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
