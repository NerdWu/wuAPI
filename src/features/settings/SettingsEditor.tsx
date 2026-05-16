import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_SETTINGS, type AppSettings, type ProxyStatus } from "@/types";

export interface SettingsEditorProps {
  settings?: AppSettings | null;
  proxyStatus?: ProxyStatus | null;
  appVersion?: string;
  isWeb?: boolean;
  groups?: string[];
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onProxyToggle?: (enabled: boolean) => void | Promise<void>;
}

function formatWuVersion(version: string) {
  if (version.includes("_wu_")) return version;
  return `${version}_wu_2026.05.16`;
}

export function SettingsEditor({
  settings,
  proxyStatus,
  appVersion,
  isWeb = false,
  groups = ["auto"],
  onChange,
  onProxyToggle,
}: SettingsEditorProps) {
  const { t } = useTranslation();
  const s = { ...DEFAULT_SETTINGS, ...settings };

  // Local state for text inputs that should only save on blur
  const [editPort, setEditPort] = useState(s.listen_port);
  const [editThreshold, setEditThreshold] = useState(s.circuit_failure_threshold);
  const [editTimeout, setEditTimeout] = useState(s.proxy_connect_timeout_secs);
  const [editRecovery, setEditRecovery] = useState(s.circuit_recovery_secs);
  const [editDisableCodes, setEditDisableCodes] = useState(s.circuit_disable_codes);
  const portEditing = useRef(false);
  const thresholdEditing = useRef(false);
  const timeoutEditing = useRef(false);
  const recoveryEditing = useRef(false);
  const disableCodesEditing = useRef(false);

  return (
    <div className="space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.proxy.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>{t("settings.proxy.port")}</Label>
            <Input
              type="number"
              className="w-32"
              value={editPort}
              onFocus={() => { portEditing.current = true; }}
              onChange={(event) => setEditPort(parseInt(event.target.value) || 9090)}
              onBlur={() => {
                portEditing.current = false;
                onChange("listen_port", editPort);
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>{t("settings.proxy.enabled")}</Label>
            <Switch
              checked={proxyStatus?.running ?? s.proxy_enabled}
              onCheckedChange={(value) => {
                if (onProxyToggle) {
                  onProxyToggle(value);
                } else {
                  onChange("proxy_enabled", value);
                }
              }}
            />
          </div>
          {(proxyStatus?.running ?? s.proxy_enabled) && (
            <div className="text-sm text-muted-foreground">
              {t("settings.proxy.address")}: http://127.0.0.1:{proxyStatus?.port ?? s.listen_port}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.security.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("settings.security.forceKey")}</Label>
              <p className="text-xs text-muted-foreground">{t("settings.security.forceKeyDesc")}</p>
            </div>
            <Switch checked={s.access_key_required} onCheckedChange={(value) => onChange("access_key_required", value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.circuit.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>{t("settings.circuit.threshold")}</Label>
            <Input
              type="number"
              className="w-32"
              value={editThreshold}
              onFocus={() => { thresholdEditing.current = true; }}
              onChange={(event) => setEditThreshold(parseInt(event.target.value) || 1)}
              onBlur={() => {
                thresholdEditing.current = false;
                onChange("circuit_failure_threshold", editThreshold);
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("settings.circuit.connectTimeout")}</Label>
              <p className="text-xs text-muted-foreground">{t("settings.circuit.connectTimeoutDesc")}</p>
            </div>
            <Input
              type="number"
              min={1}
              max={300}
              className="w-32"
              value={editTimeout}
              onFocus={() => { timeoutEditing.current = true; }}
              onChange={(event) => setEditTimeout(Math.min(300, Math.max(1, parseInt(event.target.value) || 30)))}
              onBlur={() => {
                timeoutEditing.current = false;
                onChange("proxy_connect_timeout_secs", editTimeout);
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("settings.circuit.recovery")}</Label>
              <p className="text-xs text-muted-foreground">30s - 1800s</p>
            </div>
            <Input
              type="number"
              min={30}
              max={1800}
              step={30}
              className="w-32"
              value={editRecovery}
              onFocus={() => { recoveryEditing.current = true; }}
              onChange={(event) => setEditRecovery(Math.min(1800, Math.max(30, parseInt(event.target.value) || 300)))}
              onBlur={() => {
                recoveryEditing.current = false;
                onChange("circuit_recovery_secs", editRecovery);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("settings.circuit.disableCodes")}</Label>
            <Input value={editDisableCodes}
              onFocus={() => { disableCodesEditing.current = true; }}
              onChange={(event) => setEditDisableCodes(event.target.value)}
              onBlur={() => {
                disableCodesEditing.current = false;
                onChange("circuit_disable_codes", editDisableCodes);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("settings.circuit.disableDesc")}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.general.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t("settings.general.showConversationModel")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings.general.showConversationModelDesc")}</p>
                </div>
                <Switch checked={s.show_conversation_model} onCheckedChange={(value) => onChange("show_conversation_model", value)} />
              </div>
          {appVersion && (
            <div className="flex items-center justify-between">
              <Label>{t("settings.general.currentVersion")}</Label>
              <span className="text-sm font-mono">{formatWuVersion(appVersion)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.tray.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>{t("settings.tray.autostart")}</Label>
            {isWeb ? (
              <span className="text-sm text-muted-foreground">{s.autostart ? t("common.enabled") : t("common.disabled")}</span>
            ) : (
              <Switch checked={s.autostart} onCheckedChange={(value) => onChange("autostart", value)} />
            )}
          </div>
          <div className="flex items-center justify-between">
            <Label>{t("settings.tray.startMinimized")}</Label>
            {isWeb ? (
              <span className="text-sm text-muted-foreground">{s.start_minimized ? t("common.enabled") : t("common.disabled")}</span>
            ) : (
              <Switch checked={s.start_minimized} onCheckedChange={(value) => onChange("start_minimized", value)} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
