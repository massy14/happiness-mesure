import {
  type ChangeEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type WeekEntry = {
  weekStart: string;
  deepWorkH?: number;
  playH?: number;
  realContactsPerWeek?: number;
  sleepScore?: number;
  alcoholDeviationPerWeek?: number;
  avgStepsPerDay?: number;
  emergencyFundMonths?: number;
  pipelineActionsPerWeek?: number;
  incomeJPY?: number;
  manualRedFlag?: boolean;
  paymentRedFlag?: boolean;
  notes?: string;
};

type NumberKeys =
  | "deepWorkH"
  | "playH"
  | "realContactsPerWeek"
  | "sleepScore"
  | "alcoholDeviationPerWeek"
  | "avgStepsPerDay"
  | "emergencyFundMonths"
  | "pipelineActionsPerWeek"
  | "incomeJPY";

type AutoFlags = {
  sleep: boolean;
  contacts: boolean;
  noIncome: boolean;
};

type DerivedWeek = WeekEntry & {
  totalScore: number;
  grade: "A" | "B" | "C";
  emojiLabel: string;
  autoFlags: AutoFlags;
  overallRedFlag: boolean;
};

const LOCAL_STORAGE_KEY = "scenario-scorecard-v1";

const scoreRules: Record<
  keyof Pick<
    WeekEntry,
    | "deepWorkH"
    | "playH"
    | "realContactsPerWeek"
    | "sleepScore"
    | "alcoholDeviationPerWeek"
    | "avgStepsPerDay"
    | "emergencyFundMonths"
    | "pipelineActionsPerWeek"
  >,
  (value: number) => number
> = {
  deepWorkH: (value) => (value >= 12 ? 2 : value >= 6 ? 1 : 0),
  playH: (value) => (value >= 6 ? 2 : value >= 2 ? 1 : 0),
  realContactsPerWeek: (value) => (value >= 1 ? 2 : value >= 0.5 ? 1 : 0),
  sleepScore: (value) => (value >= 7 ? 2 : value >= 5 ? 1 : 0),
  alcoholDeviationPerWeek: (value) => (value === 0 ? 2 : value === 1 ? 1 : 0),
  avgStepsPerDay: (value) => (value >= 7000 ? 2 : value >= 4000 ? 1 : 0),
  emergencyFundMonths: (value) => (value >= 12 ? 2 : value >= 6 ? 1 : 0),
  pipelineActionsPerWeek: (value) => (value >= 2 ? 2 : value >= 1 ? 1 : 0),
};

const emojiMap: Record<"A" | "B" | "C", string> = {
  A: "🟢A",
  B: "🟡B",
  C: "🔴C",
};

const sortEntries = (entries: WeekEntry[]) =>
  [...entries].sort((a, b) => a.weekStart.localeCompare(b.weekStart));

const getMonday = (date: Date) => {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const createEmptyEntry = (weekStart?: string): WeekEntry => ({
  weekStart: weekStart ?? formatDate(getMonday(new Date())),
  deepWorkH: undefined,
  playH: undefined,
  realContactsPerWeek: undefined,
  sleepScore: undefined,
  alcoholDeviationPerWeek: undefined,
  avgStepsPerDay: undefined,
  emergencyFundMonths: undefined,
  pipelineActionsPerWeek: undefined,
  incomeJPY: undefined,
  manualRedFlag: false,
  paymentRedFlag: false,
  notes: "",
});

const toNumericValue = (value: unknown): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toBooleanValue = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return Boolean(value);
};

const parseStoredEntries = (raw: unknown): WeekEntry[] | null => {
  if (!Array.isArray(raw)) {
    return null;
  }
  const sanitized: WeekEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const weekStart = (item as WeekEntry).weekStart;
    if (typeof weekStart !== "string") {
      return null;
    }
    sanitized.push({
      weekStart,
      deepWorkH: toNumericValue((item as WeekEntry).deepWorkH),
      playH: toNumericValue((item as WeekEntry).playH),
      realContactsPerWeek: toNumericValue((item as WeekEntry).realContactsPerWeek),
      sleepScore: toNumericValue((item as WeekEntry).sleepScore),
      alcoholDeviationPerWeek: toNumericValue(
        (item as WeekEntry).alcoholDeviationPerWeek
      ),
      avgStepsPerDay: toNumericValue((item as WeekEntry).avgStepsPerDay),
      emergencyFundMonths: toNumericValue(
        (item as WeekEntry).emergencyFundMonths
      ),
      pipelineActionsPerWeek: toNumericValue(
        (item as WeekEntry).pipelineActionsPerWeek
      ),
      incomeJPY: toNumericValue((item as WeekEntry).incomeJPY),
      manualRedFlag: toBooleanValue((item as WeekEntry).manualRedFlag),
      paymentRedFlag: toBooleanValue((item as WeekEntry).paymentRedFlag),
      notes: typeof (item as WeekEntry).notes === "string" ? (item as WeekEntry).notes : "",
    });
  }
  return sortEntries(sanitized);
};

const loadEntries = (): WeekEntry[] => {
  if (typeof window === "undefined") {
    return [createEmptyEntry()];
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return [createEmptyEntry()];
    }
    const parsed = JSON.parse(raw);
    const sanitized = parseStoredEntries(parsed);
    if (!sanitized || sanitized.length === 0) {
      return [createEmptyEntry()];
    }
    return sortEntries(sanitized);
  } catch (error) {
    console.error("Failed to load entries", error);
    return [createEmptyEntry()];
  }
};

const saveEntries = (entries: WeekEntry[]) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
};

const computeDerivedWeeks = (entries: WeekEntry[]): DerivedWeek[] => {
  let sleepStreak = 0;
  let contactStreak = 0;
  let noIncomeStreak = 0;

  return sortEntries(entries).map((entry) => {
    const valueOrZero = (value: number | undefined) => value ?? 0;

    const scores: number[] = [
      scoreRules.deepWorkH(valueOrZero(entry.deepWorkH)),
      scoreRules.playH(valueOrZero(entry.playH)),
      scoreRules.realContactsPerWeek(valueOrZero(entry.realContactsPerWeek)),
      scoreRules.sleepScore(valueOrZero(entry.sleepScore)),
      scoreRules.alcoholDeviationPerWeek(valueOrZero(entry.alcoholDeviationPerWeek)),
      scoreRules.avgStepsPerDay(valueOrZero(entry.avgStepsPerDay)),
      scoreRules.emergencyFundMonths(valueOrZero(entry.emergencyFundMonths)),
      scoreRules.pipelineActionsPerWeek(valueOrZero(entry.pipelineActionsPerWeek)),
    ];

    const totalScore = scores.reduce((acc, current) => acc + current, 0);
    const baseGrade: "A" | "B" | "C" =
      totalScore >= 13 ? "A" : totalScore >= 8 ? "B" : "C";

    const sleepLow = valueOrZero(entry.sleepScore) <= 4;
    sleepStreak = sleepLow ? sleepStreak + 1 : 0;
    const sleepFlag = sleepStreak >= 2;

    const contactZero = valueOrZero(entry.realContactsPerWeek) <= 0;
    contactStreak = contactZero ? contactStreak + 1 : 0;
    const contactFlag = contactStreak >= 2;

    const incomeZero = valueOrZero(entry.incomeJPY) <= 0;
    noIncomeStreak = incomeZero ? noIncomeStreak + 1 : 0;
    const noIncomeFlag = noIncomeStreak >= 8;

    const autoFlags: AutoFlags = {
      sleep: sleepFlag,
      contacts: contactFlag,
      noIncome: noIncomeFlag,
    };

    const overallRedFlag =
      entry.manualRedFlag === true ||
      entry.paymentRedFlag === true ||
      Object.values(autoFlags).some(Boolean);

    const grade: "A" | "B" | "C" = overallRedFlag ? "C" : baseGrade;
    const emojiLabel = overallRedFlag ? emojiMap.C : emojiMap[baseGrade];

    return {
      ...entry,
      totalScore,
      grade,
      emojiLabel,
      autoFlags,
      overallRedFlag,
    };
  });
};

const nextWeekStart = (current: string) => {
  const date = new Date(current);
  date.setDate(date.getDate() + 7);
  return formatDate(date);
};

const gradeDescription = (derived: DerivedWeek | undefined) => {
  if (!derived) {
    return "-";
  }
  if (derived.overallRedFlag) {
    return "C（レッドフラグ）";
  }
  return derived.grade;
};

const App = () => {
  const [entries, setEntries] = useState<WeekEntry[]>(() => loadEntries());
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveEntries(sortEntries(entries));
  }, [entries]);

  const derived = useMemo(() => computeDerivedWeeks(entries), [entries]);
  const latestWeek = derived[derived.length - 1];

  const handleEntryChange = <K extends keyof WeekEntry>(
    index: number,
    key: K,
    value: WeekEntry[K]
  ) => {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return sortEntries(next);
    });
  };

const handleNumberChange = (index: number, key: NumberKeys, value: string) => {
  handleEntryChange(index, key, toNumericValue(value) as WeekEntry[NumberKeys]);
};

  const handleAddWeek = () => {
    setEntries((prev) => {
      const sorted = sortEntries(prev);
      const last = sorted[sorted.length - 1];
      const newWeekStart = last ? nextWeekStart(last.weekStart) : formatDate(getMonday(new Date()));
      return sortEntries([...sorted, createEmptyEntry(newWeekStart)]);
    });
  };

  const handleCopyPrevious = () => {
    setEntries((prev) => {
      const sorted = sortEntries(prev);
      const last = sorted[sorted.length - 1];
      if (!last) {
        return sorted;
      }
      const newWeek: WeekEntry = {
        weekStart: nextWeekStart(last.weekStart),
        deepWorkH: last.deepWorkH,
        playH: last.playH,
        realContactsPerWeek: last.realContactsPerWeek,
        sleepScore: last.sleepScore,
        alcoholDeviationPerWeek: last.alcoholDeviationPerWeek,
        avgStepsPerDay: last.avgStepsPerDay,
        emergencyFundMonths: last.emergencyFundMonths,
        pipelineActionsPerWeek: last.pipelineActionsPerWeek,
        incomeJPY: last.incomeJPY,
        manualRedFlag: false,
        paymentRedFlag: false,
        notes: "",
      };
      return sortEntries([...sorted, newWeek]);
    });
  };

  const handleDeleteEntry = (index: number) => {
    setEntries((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      const next = prev.filter((_, idx) => idx !== index);
      return sortEntries(next);
    });
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(sortEntries(entries), null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "scenario-scorecard-data.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  const handleImport: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const sanitized = parseStoredEntries(parsed);
      if (!sanitized) {
        throw new Error("invalid");
      }
      setEntries(sanitized);
      setImportError(null);
    } catch (error) {
      console.error("Failed to import data", error);
      setImportError("読み込みに失敗しました。フォーマットを確認してください。");
    } finally {
      event.target.value = "";
    }
  };

  const handleClearAll = () => {
    const confirmed = window.confirm("全データを削除しますか？この操作は元に戻せません。");
    if (!confirmed) {
      return;
    }
    setEntries([createEmptyEntry()]);
  };

  const flagLabels = (week: DerivedWeek) => {
    const labels: string[] = [];
    if (week.autoFlags.sleep) labels.push("睡眠");
    if (week.autoFlags.contacts) labels.push("対面");
    if (week.autoFlags.noIncome) labels.push("無収入");
    if (week.manualRedFlag) labels.push("手動");
    if (week.paymentRedFlag) labels.push("支払");
    return labels.length > 0 ? labels.join(" / ") : "-";
  };

  const chartData = derived.map((week, index) => ({
    name: `${index + 1}週目`,
    score: week.totalScore,
  }));

  return (
    <div className="min-h-screen w-full px-4 pb-16">
      <header className="mx-auto max-w-6xl py-8">
        <h1 className="text-2xl font-bold text-neutral-900">週次幸福メトリクス</h1>
        <p className="mt-2 text-sm text-neutral-600">
          8つの指標から現在地を判定し、レッドフラグを自動検出します。
        </p>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-500">🧭 今週の判定</h2>
            <p className="mt-3 text-2xl font-bold">{latestWeek?.emojiLabel ?? "-"}</p>
            <p className="text-sm text-neutral-500">{gradeDescription(latestWeek)}</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-500">📈 合計スコア</h2>
            <p className="mt-3 text-3xl font-bold">
              {latestWeek ? `${latestWeek.totalScore} / 16` : "-"}
            </p>
            <p className="text-sm text-neutral-500">最新週のスコア合計</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-500">📊 スコア推移</h2>
            <div className="mt-3 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#737373" />
                  <YAxis domain={[0, 16]} tick={{ fontSize: 12 }} stroke="#737373" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: "12px" }}
                    formatter={(value: number) => [`${value}点`, "スコア"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="rounded-lg bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-neutral-800">週次入力</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800"
                onClick={handleAddWeek}
              >
                ➕ 週を追加
              </button>
              <button
                type="button"
                className="rounded-md bg-neutral-200 px-3 py-1.5 font-medium text-neutral-800 hover:bg-neutral-300"
                onClick={handleCopyPrevious}
              >
                📋 前週コピー
              </button>
              <button
                type="button"
                className="rounded-md bg-neutral-200 px-3 py-1.5 font-medium text-neutral-800 hover:bg-neutral-300"
                onClick={handleExport}
              >
                ⬇️ エクスポート
              </button>
              <button
                type="button"
                className="rounded-md bg-neutral-200 px-3 py-1.5 font-medium text-neutral-800 hover:bg-neutral-300"
                onClick={triggerImport}
              >
                ⬆️ インポート
              </button>
              <button
                type="button"
                className="rounded-md bg-red-100 px-3 py-1.5 font-medium text-red-700 hover:bg-red-200"
                onClick={handleClearAll}
              >
                🗑️ 全消去
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImport}
              />
            </div>
          </div>
          {importError && (
            <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{importError}</p>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full table-auto text-sm">
              <thead>
                <tr className="bg-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  <th className="px-3 py-2">📅 週はじまり</th>
                  <th className="px-3 py-2">🧠 深い仕事</th>
                  <th className="px-3 py-2">🎵 創作</th>
                  <th className="px-3 py-2">👥 対面</th>
                  <th className="px-3 py-2">🌙 睡眠</th>
                  <th className="px-3 py-2">🍷 逸脱</th>
                  <th className="px-3 py-2">🏃 歩数</th>
                  <th className="px-3 py-2">💰 緊急資金</th>
                  <th className="px-3 py-2">✅ パイプライン</th>
                  <th className="px-3 py-2">💴 収入</th>
                  <th className="px-3 py-2">∑ 合計</th>
                  <th className="px-3 py-2">🚩 フラグ</th>
                  <th className="px-3 py-2">🏷️ ラベル</th>
                  <th className="px-3 py-2">👀 一目</th>
                  <th className="px-3 py-2">🛠️ 操作</th>
                </tr>
              </thead>
              <tbody>
                {derived.map((week, index) => (
                  <tr key={`${week.weekStart}-${index}`} className="border-b border-neutral-100">
                    <td className="px-3 py-2 align-top">
                      <input
                        type="date"
                        value={week.weekStart}
                        onChange={(event) =>
                          handleEntryChange(index, "weekStart", event.target.value)
                        }
                        className="w-32 rounded-md border border-neutral-200 px-2 py-1 focus:border-neutral-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={week.deepWorkH ?? ""}
                        onChange={(event) =>
                          handleNumberChange(index, "deepWorkH", event.target.value)
                        }
                        className="w-24 rounded-md border border-neutral-200 px-2 py-1 focus:border-neutral-400 focus:outline-none"
                        placeholder="時間"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={week.playH ?? ""}
                        onChange={(event) =>
                          handleNumberChange(index, "playH", event.target.value)
                        }
                        className="w-24 rounded-md border border-neutral-200 px-2 py-1 focus:border-neutral-400 focus:outline-none"
                        placeholder="時間"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="14"
                        value={week.realContactsPerWeek ?? ""}
                        onChange={(event) =>
                          handleNumberChange(
                            index,
                            "realContactsPerWeek",
                            event.target.value
                          )
                        }
                        className="w-20 rounded-md border border-neutral-200 px-2 py-1 focus:border-neutral-400 focus:outline-none"
                        placeholder="回"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="10"
                        value={week.sleepScore ?? ""}
                        onChange={(event) =>
                          handleNumberChange(index, "sleepScore", event.target.value)
                        }
                        className="w-20 rounded-md border border-neutral-200 px-2 py-1 focus:border-neutral-400 focus:outline-none"
                        placeholder="1-10"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="14"
                        value={week.alcoholDeviationPerWeek ?? ""}
                        onChange={(event) =>
                          handleNumberChange(
                            index,
                            "alcoholDeviationPerWeek",
                            event.target.value
                          )
                        }
                        className="w-20 rounded-md border border-neutral-200 px-2 py-1 focus:border-neutral-400 focus:outline-none"
                        placeholder="回"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="100"
                        min="0"
                        max="50000"
                        value={week.avgStepsPerDay ?? ""}
                        onChange={(event) =>
                          handleNumberChange(index, "avgStepsPerDay", event.target.value)
                        }
                        className="w-28 rounded-md border border-neutral-200 px-2 py-1 focus:border-neutral-400 focus:outline-none"
                        placeholder="歩"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="60"
                        value={week.emergencyFundMonths ?? ""}
                        onChange={(event) =>
                          handleNumberChange(
                            index,
                            "emergencyFundMonths",
                            event.target.value
                          )
                        }
                        className="w-24 rounded-md border border-neutral-200 px-2 py-1 focus:border-neutral-400 focus:outline-none"
                        placeholder="月"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="50"
                        value={week.pipelineActionsPerWeek ?? ""}
                        onChange={(event) =>
                          handleNumberChange(
                            index,
                            "pipelineActionsPerWeek",
                            event.target.value
                          )
                        }
                        className="w-20 rounded-md border border-neutral-200 px-2 py-1 focus:border-neutral-400 focus:outline-none"
                        placeholder="回"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="1000"
                        min="0"
                        max="1000000000"
                        value={week.incomeJPY ?? ""}
                        onChange={(event) =>
                          handleNumberChange(index, "incomeJPY", event.target.value)
                        }
                        className="w-32 rounded-md border border-neutral-200 px-2 py-1 focus:border-neutral-400 focus:outline-none"
                        placeholder="円"
                      />
                    </td>
                    <td className="px-3 py-2 align-top font-semibold text-neutral-800">
                      {week.totalScore}
                    </td>
                    <td className="px-3 py-2 align-top text-neutral-700">
                      {flagLabels(week)}
                    </td>
                    <td className="px-3 py-2 align-top text-neutral-700">
                      {gradeDescription(week)}
                    </td>
                    <td className="px-3 py-2 align-top text-lg font-semibold">
                      {week.emojiLabel}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 text-xs text-neutral-600">
                          <input
                            type="checkbox"
                            checked={week.manualRedFlag ?? false}
                            onChange={(event) =>
                              handleEntryChange(index, "manualRedFlag", event.target.checked)
                            }
                          />
                          手動RF
                        </label>
                        <label className="flex items-center gap-2 text-xs text-neutral-600">
                          <input
                            type="checkbox"
                            checked={week.paymentRedFlag ?? false}
                            onChange={(event) =>
                              handleEntryChange(index, "paymentRedFlag", event.target.checked)
                            }
                          />
                          支払RF
                        </label>
                        <textarea
                          value={week.notes ?? ""}
                          onChange={(event) =>
                            handleEntryChange(index, "notes", event.target.value)
                          }
                          className="mt-2 w-48 rounded-md border border-neutral-200 px-2 py-1 text-xs focus:border-neutral-400 focus:outline-none"
                          placeholder="メモ"
                          rows={3}
                        />
                        <button
                          type="button"
                          className="w-20 rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
                          onClick={() => handleDeleteEntry(index)}
                          disabled={entries.length <= 1}
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
