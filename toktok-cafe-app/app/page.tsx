"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Clock3, ExternalLink, Gift, LayoutGrid, Maximize2, MessageCircle, Minimize2, MonitorCog, RotateCcw, Smartphone, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

const TOPICS = [
  "그림책으로 여는 독서수업", "AI·에듀테크 수업", "기초학력 맞춤 지도", "생각을 키우는 수학",
  "함께 배우는 통합교육", "학교 생태전환교육", "관계 중심 인성교육", "예술로 잇는 교실",
  "모두가 즐거운 체육", "다문화 감수성 수업", "탐구질문 기반 수업", "놀이로 배우는 교실",
  "평가와 피드백", "학급경영 아이디어", "학생 주도 프로젝트",
];

type EventData = {
  state: { currentRound: number; status: "ready" | "active" | "break" | "ended"; roundStartedAt: string | null };
  attendanceRound: number | null;
  capacity: number;
  counts: Record<string, number>;
  feedback: Array<{ id: number; name: string; message: string; winner: boolean; created_at: string }>;
  materials: Record<string, string>;
  materialImages: Record<string, string>;
  serverTime: string;
};

const EMPTY: EventData = { state: { currentRound: 1, status: "ready", roundStartedAt: null }, attendanceRound: 1, capacity: 7, counts: {}, feedback: [], materials: {}, materialImages: {}, serverTime: new Date().toISOString() };

async function send(action: string, payload: Record<string, unknown> = {}, operatorPin?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (operatorPin) headers["X-Operator-Pin"] = operatorPin;
  const response = await fetch("/api/event", { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
  const body = await response.json() as { error?: string; [key: string]: unknown };
  if (!response.ok) throw new Error(body.error || "요청을 처리하지 못했습니다.");
  return body;
}

function statusLabel(status: EventData["state"]["status"]) {
  if (status === "ready") return "시작 전";
  if (status === "break") return "이동 시간";
  if (status === "ended") return "종료";
  return "참석 가능";
}

function safeBackgroundStyle(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    const safeUrl = url.href.replace(/["'()\\\n\r\f]/g, (character) => encodeURIComponent(character));
    return { backgroundImage: `url("${safeUrl}")` };
  } catch {
    return undefined;
  }
}

export default function Home() {
  const [data, setData] = useState<EventData>(EMPTY);
  const [selectedTable, setSelectedTable] = useState("1");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [materialUrl, setMaterialUrl] = useState("");
  const [materialImageUrl, setMaterialImageUrl] = useState("");
  const [feedbackUrl, setFeedbackUrl] = useState("/feedback");
  const [secondsLeft, setSecondsLeft] = useState(1200);
  const [winner, setWinner] = useState<{ name: string; message: string } | null>(null);
  const [operatorPin, setOperatorPin] = useState("");
  const [operatorVerified, setOperatorVerified] = useState(false);
  const [connected, setConnected] = useState(true);
  const [serverOffset, setServerOffset] = useState(0);
  const [confirmAction, setConfirmAction] = useState<"reset" | "end" | null>(null);
  const [timerExpanded, setTimerExpanded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/event", { cache: "no-store" });
      const body = await response.json() as EventData & { error?: string };
      if (!response.ok) throw new Error(body.error || "현황을 불러오지 못했습니다.");
      setData(body);
      setServerOffset(new Date(body.serverTime).getTime() - Date.now());
      setConnected(true);
    } catch {
      setConnected(false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const id = window.setInterval(() => void refresh(), 2000);
    return () => { window.clearTimeout(initial); window.clearInterval(id); };
  }, [refresh]);
  useEffect(() => {
    const id = window.setTimeout(() => setFeedbackUrl(`${window.location.origin}/feedback`), 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    const tick = () => {
      if (data.state.status !== "active" || !data.state.roundStartedAt) return setSecondsLeft(1200);
      const elapsed = Math.floor((Date.now() + serverOffset - new Date(data.state.roundStartedAt).getTime()) / 1000);
      setSecondsLeft(Math.max(0, 1200 - elapsed));
    };
    tick(); const id = window.setInterval(tick, 1000); return () => window.clearInterval(id);
  }, [data.state.roundStartedAt, data.state.status, serverOffset]);

  useEffect(() => {
    if (!timerExpanded) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setTimerExpanded(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [timerExpanded]);

  const act = useCallback(async (action: string, payload: Record<string, unknown> = {}, success?: string, pin?: string) => {
    setBusy(true);
    try { const result = await send(action, payload, pin); if (success) toast.success(success); await refresh(); return result; }
    catch (error) { toast.error(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }, [refresh]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal: AbortSignal }) => void | Promise<unknown> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => {
      try {
        const pending = context.registerTool?.(tool, { signal: lifecycle.signal });
        if (pending instanceof Promise) void pending.catch(() => undefined);
      } catch { /* optional API */ }
    };
    register({ name: "read_event_status", title: "행사 현황 읽기", description: "현재 회차와 15개 테이블 잔여 좌석을 읽습니다.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async () => { const response = await fetch("/api/event", { cache: "no-store" }); return response.json(); } });
    register({ name: "record_attendance", title: "테이블 참석 등록", description: "선택한 테이블의 현재 접수 회차 참석 인원을 1명 늘립니다.", inputSchema: { type: "object", properties: { tableId: { type: "integer", minimum: 1, maximum: 15 } }, required: ["tableId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: { tableId: number }) => send("attend", input) });
    register({ name: "submit_feedback", title: "참여 소감 등록", description: "행사 참여 소감을 공유하고 추첨 대상에 포함합니다.", inputSchema: { type: "object", properties: { name: { type: "string", maxLength: 30 }, message: { type: "string", minLength: 1, maxLength: 500 } }, required: ["message"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: async (input: { name?: string; message: string }) => send("feedback", input) });
    return () => lifecycle.abort();
  }, []);

  const occupied = useMemo(() => Object.values(data.counts).reduce((sum, count) => sum + Number(count), 0), [data.counts]);
  const selectedCount = Number(data.counts[selectedTable] ?? 0);
  const selectedRemaining = Math.max(0, data.capacity - selectedCount);
  const attendanceOpen = data.attendanceRound !== null;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  if (data.state.status === "ended") {
    return <main className="end-screen"><div className="end-mark"><Check size={38} /></div><p className="eyebrow">수업나눔 톡톡!카페</p><h1>모든 활동이 종료되었습니다.</h1><p>참여해주셔서 감사합니다.</p><div className="end-reset"><Input type="password" value={operatorPin} onChange={(event) => setOperatorPin(event.target.value)} placeholder="운영자 PIN" aria-label="운영자 PIN" /><Button variant="outline" onClick={() => void act("reset", {}, "새 운영을 준비했습니다.", operatorPin)} disabled={busy || !operatorPin}><RotateCcw /> 새 운영 준비</Button></div><Toaster /></main>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-brand"><span className="header-logo"><Image src="/jungbu-office-logo.png" alt="서울특별시중부교육지원청" width={2168} height={725} style={{ width: "100%", height: "auto" }} priority /></span><div><p className="eyebrow">2026 수업 나눔의 날</p><h1>수업나눔 톡톡!카페</h1></div></div>
        <div className="round-panel" aria-live="polite"><span>{data.state.currentRound}회차 · {statusLabel(data.state.status)}</span><strong>{data.state.status === "active" ? `${mm}:${ss}` : "20:00"}</strong></div>
      </header>

      <Tabs defaultValue="status" className="workspace">
        <TabsList className="nav-tabs">
          <TabsTrigger value="status"><LayoutGrid />현황</TabsTrigger><TabsTrigger value="tablet"><Users />참석</TabsTrigger><TabsTrigger value="materials"><BookOpen />자료</TabsTrigger><TabsTrigger value="feedback"><MessageCircle />소감</TabsTrigger><TabsTrigger value="control"><MonitorCog />운영</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="content-panel">
          <section className="summary-row"><div><span>{data.attendanceRound ? `${data.attendanceRound}회차 참여` : "참석 접수 종료"}</span><strong>{occupied}<small>명</small></strong></div><div><span>남은 좌석</span><strong>{data.capacity * 15 - occupied}<small>석</small></strong></div><div><span>운영 테이블</span><strong>15<small>개</small></strong></div></section>
          <section className="section-heading"><div><p className="eyebrow">{data.attendanceRound ? `${data.attendanceRound}회차 실시간 좌석 현황` : "참석 접수 종료"}</p><h2>참여할 테이블을 골라보세요</h2></div><span className={`live-pill ${connected ? "" : "offline"}`}><i />{connected ? "2초마다 반영" : "연결 끊김 · 다시 연결 중"}</span></section>
          <div className="table-grid" role="region" aria-live="polite" aria-label="테이블별 잔여 좌석 현황">
            {TOPICS.map((topic, index) => { const id = index + 1; const count = Number(data.counts[id] ?? 0); const remaining = Math.max(0, data.capacity - count); const imageUrl = data.materialImages[String(id)]; return <article className={`table-card ${imageUrl ? "has-image" : ""} ${remaining === 0 ? "full" : remaining <= 3 ? "nearly" : ""}`} aria-label={`${topic}, ${remaining}석 남음`} key={topic}>{imageUrl && <div className="table-image" style={safeBackgroundStyle(imageUrl)} aria-hidden="true" />}<div className="table-card-content"><div className="table-number">TABLE {String(id).padStart(2, "0")}</div><h3>{topic}</h3><div className="seat-line"><strong>{remaining}</strong><span>자리 남음</span></div><Progress value={(count / data.capacity) * 100} aria-label={`${topic} 좌석 사용률`} /><p>{count}/{data.capacity}명 참여</p></div></article>; })}
          </div>
        </TabsContent>

        <TabsContent value="tablet" className="content-panel tablet-view">
          <section className="tablet-card"><p className="eyebrow">{data.attendanceRound ? `${data.attendanceRound}회차 참석 등록` : "참석 접수 종료"}</p><h2>참여할 테이블을 선택하세요</h2><p className="tablet-intro">행사 시작 전, 회차 진행 중, 다음 회차 이동 시간에도 언제든 참석을 등록할 수 있습니다.</p><Select value={selectedTable} onValueChange={setSelectedTable}><SelectTrigger className="table-select"><SelectValue /></SelectTrigger><SelectContent>{TOPICS.map((topic, i) => <SelectItem key={topic} value={String(i + 1)}>{i + 1}. {topic}</SelectItem>)}</SelectContent></Select><div className="selected-topic"><span>{data.attendanceRound ? `${data.attendanceRound}회차 · ` : ""}TABLE {String(selectedTable).padStart(2, "0")}</span><strong>{TOPICS[Number(selectedTable) - 1]}</strong><p><b>{selectedRemaining}</b>자리 남았습니다</p></div><Button className="attend-button" disabled={busy || selectedRemaining === 0 || !attendanceOpen} onClick={async () => { const result = await act("attend", { tableId: Number(selectedTable) }); if (result) toast.success(`${Number(result.attendanceRound)}회차 참석이 등록되었습니다.`); }}><Users />{selectedRemaining === 0 ? "정원이 찼습니다" : attendanceOpen ? "이 테이블에 참석하기" : "참석 접수가 종료되었습니다"}</Button><p className="helper">운영자 인증 없이 언제든 등록할 수 있으며, 회차가 끝나면 다음 회차 좌석 현황은 0명으로 전환됩니다.</p></section>
        </TabsContent>

        <TabsContent value="materials" className="content-panel">
          <section className="material-heading"><p className="eyebrow">TEACHER PROJECT ARCHIVE · 2026</p><h2>교실에서 시작된<br />열다섯 개의 이야기</h2><p>각 테이블의 운영 교사가 준비한 수업 자료를 한 편의 포트폴리오처럼 만나보세요.</p></section>
          <div className="material-showcase">{TOPICS.map((topic, i) => { const id = String(i + 1); const url = data.materials[id]; const imageUrl = data.materialImages[id]; return <article className={`material-project project-${(i % 6) + 1} ${imageUrl ? "has-image" : ""}`} key={topic}>{imageUrl && <div className="project-image" style={safeBackgroundStyle(imageUrl)} aria-hidden="true" />}<div className="project-copy"><span>{id.padStart(2, "0")} / 15</span><h3>{topic}</h3><p>{url ? "운영 교사의 수업 나눔 자료" : "자료 준비 중"}</p>{url ? <a href={url} target="_blank" rel="noreferrer">프로젝트 보기 <ExternalLink /></a> : <span className="project-waiting">곧 공개됩니다</span>}</div></article>; })}</div>
        </TabsContent>

        <TabsContent value="feedback" className="content-panel feedback-layout">
          <section className="feedback-form"><p className="eyebrow">소통의 시간</p><h2>오늘의 배움을 나눠주세요</h2><Label htmlFor="name">이름 또는 별명</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="익명으로 남겨도 좋아요" maxLength={30} /><Label htmlFor="message">참여 소감</Label><Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="기억에 남은 배움이나 동료에게 전하고 싶은 말을 적어주세요." maxLength={500} /><div className="form-footer"><span>{message.length}/500</span><Button disabled={busy || !message.trim()} onClick={async () => { const result = await act("feedback", { name, message }, "소감이 공유되었습니다."); if (result) setMessage(""); }}>소감 공유하기</Button></div></section>
          <aside className="feedback-qr"><div><p className="eyebrow">MOBILE FEEDBACK</p><h2>휴대폰으로 바로 작성</h2><p>카메라로 QR을 비추면 소감 입력 전용 모바일 화면이 열립니다.</p></div><a href={feedbackUrl} aria-label="모바일 소감 작성 화면 열기"><QRCodeSVG value={feedbackUrl} size={188} level="H" marginSize={3} fgColor="#10213d" imageSettings={{ src: "/jungbu-office-symbol.png", height: 40, width: 40, excavate: true, opacity: 1 }} title="중부교육지원청 아이콘이 포함된 모바일 소감 작성 QR 코드" /><span><Smartphone />직접 열기</span></a></aside>
          <section className="feedback-wall"><div className="wall-heading"><div><p className="eyebrow">실시간 소감</p><h2>{data.feedback.length}개의 이야기</h2></div><MessageCircle /></div>{data.feedback.length === 0 ? <p className="empty-copy">첫 번째 소감을 남겨주세요.</p> : <div className="messages">{data.feedback.map((item) => <article key={item.id} className={item.winner ? "winner-message" : ""}><p>{item.message}</p><span>{item.name}{item.winner ? " · 당첨" : ""}</span></article>)}</div>}</section>
        </TabsContent>

        <TabsContent value="control" className="content-panel control-layout">
          <section className="operator-login"><div><p className="eyebrow">운영자 보호</p><strong>{operatorVerified ? "운영자 인증됨" : "PIN을 입력해야 운영 기능을 사용할 수 있습니다."}</strong></div><Input type="password" value={operatorPin} onChange={(event) => { setOperatorPin(event.target.value); setOperatorVerified(false); }} placeholder="운영자 PIN" aria-label="운영자 PIN" /><Button variant={operatorVerified ? "outline" : "default"} disabled={busy || !operatorPin || operatorVerified} onClick={async () => { const result = await act("verify_operator", {}, "운영자 인증이 완료되었습니다.", operatorPin); if (result) { setOperatorVerified(true); setMaterialUrl(data.materials[selectedTable] || ""); setMaterialImageUrl(data.materialImages[selectedTable] || ""); } }}>{operatorVerified ? "인증 완료" : "인증하기"}</Button></section>
          <section className="control-card"><p className="eyebrow">회차 운영</p><h2>{data.state.currentRound}회차 · {statusLabel(data.state.status)}</h2><button type="button" className="clock clock-button" onClick={() => setTimerExpanded(true)} aria-label="타이머 전체 화면으로 확대"><Clock3 /><strong>{mm}:{ss}</strong><span>20분 활동 · 눌러서 크게 보기</span><Maximize2 className="expand-icon" /></button><div className="control-buttons">{data.state.status === "ready" && <Button onClick={() => void act("start", {}, "1회차를 시작했습니다.", operatorPin)} disabled={busy || !operatorVerified}>1회차 시작</Button>}{data.state.status === "active" && <Button variant="outline" onClick={() => void act("pause", {}, "회차를 마쳤습니다.", operatorPin)} disabled={busy || !operatorVerified}>회차 마치기</Button>}{data.state.status === "break" && data.state.currentRound < 3 && <Button onClick={() => void act("next", {}, `${data.state.currentRound + 1}회차를 시작했습니다.`, operatorPin)} disabled={busy || !operatorVerified}>다음 회차 시작</Button>}{data.state.status === "break" && data.state.currentRound === 3 && <Button onClick={() => setConfirmAction("end")} disabled={busy || !operatorVerified}>전체 활동 종료</Button>}<Button variant="ghost" onClick={() => setConfirmAction("reset")} disabled={busy || !operatorVerified}><RotateCcw />초기화</Button></div><p className="helper">회차를 마치면 즉시 다음 회차 좌석 현황이 0명으로 전환되며, 이동 시간에도 참석을 등록할 수 있습니다.</p></section>
          <section className="control-card"><p className="eyebrow">자료 등록</p><h2>발표 자료와 대표 이미지 연결</h2><Label>테이블</Label><Select value={selectedTable} onValueChange={(value) => { setSelectedTable(value); setMaterialUrl(data.materials[value] || ""); setMaterialImageUrl(data.materialImages[value] || ""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TOPICS.map((topic, i) => <SelectItem key={topic} value={String(i + 1)}>{i + 1}. {topic}</SelectItem>)}</SelectContent></Select><Label htmlFor="material-url">발표 자료 주소</Label><Input id="material-url" type="url" value={materialUrl} onChange={(e) => setMaterialUrl(e.target.value)} placeholder="https://" /><Label htmlFor="material-image-url">대표 이미지 주소</Label><Input id="material-image-url" type="url" value={materialImageUrl} onChange={(e) => setMaterialImageUrl(e.target.value)} placeholder="https://.../대표이미지.jpg" /><p className="helper">공개된 이미지 주소를 넣으면 현황의 원형 테이블 배경과 자료 화면에 함께 표시됩니다.</p><Button variant="outline" disabled={busy || !materialUrl || !operatorVerified} onClick={() => void act("material", { tableId: Number(selectedTable), url: materialUrl, imageUrl: materialImageUrl }, "자료와 대표 이미지를 저장했습니다.", operatorPin)}>자료 저장</Button></section>
          <section className="control-card raffle-card"><p className="eyebrow">참여자 추첨</p><h2>소감 작성자 중 한 명 뽑기</h2><Gift size={42} /><p>현재 {data.feedback.filter((item) => !item.winner).length}명이 추첨을 기다리고 있습니다.</p><Button disabled={busy || !operatorVerified || data.feedback.filter((item) => !item.winner).length === 0} onClick={async () => { const result = await act("raffle", {}, undefined, operatorPin); const picked = result?.winner as { name: string; message: string } | undefined; if (picked) setWinner(picked); }}>지금 추첨하기</Button></section>
        </TabsContent>
      </Tabs>

      <footer className="site-footer"><Image src="/jungbu-office-logo.png" alt="서울특별시중부교육지원청" width={2168} height={725} style={{ width: "min(271px, 72vw)", height: "auto" }} /><p>2026 수업 나눔의 날 · 수업나눔 톡톡!카페</p></footer>

      {timerExpanded && <div className="timer-fullscreen" role="dialog" aria-modal="true" aria-label={`${data.state.currentRound}회차 전체 화면 타이머`}><button type="button" className="timer-close" onClick={() => setTimerExpanded(false)}><Minimize2 />작게 보기</button><div className="timer-brand"><Image src="/jungbu-office-logo.png" alt="서울특별시중부교육지원청" width={2168} height={725} style={{ width: "100%", height: "auto" }} priority /></div><div className="timer-content"><p>2026 수업 나눔의 날</p><h2>수업나눔 톡톡!카페</h2><span>{data.state.currentRound}회차 · {statusLabel(data.state.status)}</span><strong>{data.state.status === "active" ? `${mm}:${ss}` : "20:00"}</strong><small>{data.state.status === "active" ? "수업 나눔이 진행 중입니다" : "회차 시작을 준비해 주세요"}</small></div></div>}

      <Dialog open={!!winner} onOpenChange={(open) => !open && setWinner(null)}><DialogContent className="winner-dialog"><DialogHeader><DialogDescription>축하합니다!</DialogDescription><DialogTitle>{winner?.name} 님이 당첨되었습니다</DialogTitle></DialogHeader><Gift size={64} /><blockquote>“{winner?.message}”</blockquote><Button onClick={() => setWinner(null)}>확인</Button></DialogContent></Dialog>
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmAction === "reset" ? "운영 현황을 초기화할까요?" : "모든 활동을 종료할까요?"}</AlertDialogTitle><AlertDialogDescription>{confirmAction === "reset" ? "참석 기록과 참여 소감이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다." : "모든 화면에 활동 종료 안내가 표시됩니다."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => { const action = confirmAction; setConfirmAction(null); if (action) void act(action, {}, action === "reset" ? "운영 현황을 초기화했습니다." : "모든 활동을 종료했습니다.", operatorPin); }}>{confirmAction === "reset" ? "초기화" : "활동 종료"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      {loading && <div className="loading-bar" aria-label="현황 불러오는 중" />}<Toaster position="top-center" richColors />
    </main>
  );
}
