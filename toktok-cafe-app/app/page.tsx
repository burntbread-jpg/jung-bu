"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Clock3, ExternalLink, Gift, LayoutGrid, MessageCircle, MonitorCog, RotateCcw, Users } from "lucide-react";
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
  capacity: number;
  counts: Record<string, number>;
  feedback: Array<{ id: number; name: string; message: string; winner: boolean; created_at: string }>;
  materials: Record<string, string>;
  serverTime: string;
};

const EMPTY: EventData = { state: { currentRound: 1, status: "ready", roundStartedAt: null }, capacity: 10, counts: {}, feedback: [], materials: {}, serverTime: new Date().toISOString() };

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

export default function Home() {
  const [data, setData] = useState<EventData>(EMPTY);
  const [selectedTable, setSelectedTable] = useState("1");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [materialUrl, setMaterialUrl] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(1200);
  const [winner, setWinner] = useState<{ name: string; message: string } | null>(null);
  const [operatorPin, setOperatorPin] = useState("");
  const [operatorVerified, setOperatorVerified] = useState(false);
  const [connected, setConnected] = useState(true);
  const [serverOffset, setServerOffset] = useState(0);
  const [confirmAction, setConfirmAction] = useState<"reset" | "end" | null>(null);

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
    const tick = () => {
      if (data.state.status !== "active" || !data.state.roundStartedAt) return setSecondsLeft(1200);
      const elapsed = Math.floor((Date.now() + serverOffset - new Date(data.state.roundStartedAt).getTime()) / 1000);
      setSecondsLeft(Math.max(0, 1200 - elapsed));
    };
    tick(); const id = window.setInterval(tick, 1000); return () => window.clearInterval(id);
  }, [data.state.roundStartedAt, data.state.status, serverOffset]);

  const act = useCallback(async (action: string, payload: Record<string, unknown> = {}, success?: string, pin?: string) => {
    setBusy(true);
    try { const result = await send(action, payload, pin); if (success) toast.success(success); await refresh(); return result; }
    catch (error) { toast.error(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }, [refresh]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal: AbortSignal }) => void } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => { try { context.registerTool?.(tool, { signal: lifecycle.signal }); } catch { /* optional API */ } };
    register({ name: "read_event_status", title: "행사 현황 읽기", description: "현재 회차와 15개 테이블 잔여 좌석을 읽습니다.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async () => { const response = await fetch("/api/event", { cache: "no-store" }); return response.json(); } });
    register({ name: "record_attendance", title: "테이블 참석 등록", description: "선택한 테이블의 현재 회차 참석 인원을 1명 늘립니다.", inputSchema: { type: "object", properties: { tableId: { type: "integer", minimum: 1, maximum: 15 } }, required: ["tableId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: { tableId: number }) => send("attend", input) });
    register({ name: "submit_feedback", title: "참여 소감 등록", description: "행사 참여 소감을 공유하고 추첨 대상에 포함합니다.", inputSchema: { type: "object", properties: { name: { type: "string", maxLength: 30 }, message: { type: "string", minLength: 1, maxLength: 240 } }, required: ["message"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: async (input: { name?: string; message: string }) => send("feedback", input) });
    return () => lifecycle.abort();
  }, []);

  const occupied = useMemo(() => Object.values(data.counts).reduce((sum, count) => sum + Number(count), 0), [data.counts]);
  const selectedCount = Number(data.counts[selectedTable] ?? 0);
  const selectedRemaining = Math.max(0, data.capacity - selectedCount);
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  if (data.state.status === "ended") {
    return <main className="end-screen"><div className="end-mark"><Check size={38} /></div><p className="eyebrow">수업나눔 톡톡!카페</p><h1>모든 활동이 종료되었습니다.</h1><p>참여해주셔서 감사합니다.</p><div className="end-reset"><Input type="password" value={operatorPin} onChange={(event) => setOperatorPin(event.target.value)} placeholder="운영자 PIN" aria-label="운영자 PIN" /><Button variant="outline" onClick={() => void act("reset", {}, "새 운영을 준비했습니다.", operatorPin)} disabled={busy || !operatorPin}><RotateCcw /> 새 운영 준비</Button></div><Toaster /></main>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><p className="eyebrow">2026 수업 나눔의 달</p><h1>수업나눔 톡톡!카페</h1></div>
        <div className="round-panel" aria-live="polite"><span>{data.state.currentRound}회차 · {statusLabel(data.state.status)}</span><strong>{data.state.status === "active" ? `${mm}:${ss}` : "20:00"}</strong></div>
      </header>

      <Tabs defaultValue="status" className="workspace">
        <TabsList className="nav-tabs">
          <TabsTrigger value="status"><LayoutGrid />현황</TabsTrigger><TabsTrigger value="tablet"><Users />참석</TabsTrigger><TabsTrigger value="materials"><BookOpen />자료</TabsTrigger><TabsTrigger value="feedback"><MessageCircle />소감</TabsTrigger><TabsTrigger value="control"><MonitorCog />운영</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="content-panel">
          <section className="summary-row"><div><span>현재 참여</span><strong>{occupied}<small>명</small></strong></div><div><span>남은 좌석</span><strong>{data.capacity * 15 - occupied}<small>석</small></strong></div><div><span>운영 테이블</span><strong>15<small>개</small></strong></div></section>
          <section className="section-heading"><div><p className="eyebrow">실시간 좌석 현황</p><h2>참여할 테이블을 골라보세요</h2></div><span className={`live-pill ${connected ? "" : "offline"}`}><i />{connected ? "2초마다 반영" : "연결 끊김 · 다시 연결 중"}</span></section>
          <div className="table-grid" role="region" aria-live="polite" aria-label="테이블별 잔여 좌석 현황">
            {TOPICS.map((topic, index) => { const id = index + 1; const count = Number(data.counts[id] ?? 0); const remaining = Math.max(0, data.capacity - count); return <article className={`table-card ${remaining === 0 ? "full" : remaining <= 3 ? "nearly" : ""}`} aria-label={`${topic}, ${remaining}석 남음`} key={topic}><div className="table-number">{String(id).padStart(2, "0")}</div><h3>{topic}</h3><div className="seat-line"><strong>{remaining}</strong><span>자리 남음</span></div><Progress value={(count / data.capacity) * 100} aria-label={`${topic} 좌석 사용률`} /><p>{count}/{data.capacity}명 참여</p></article>; })}
          </div>
        </TabsContent>

        <TabsContent value="tablet" className="content-panel tablet-view">
          <section className="tablet-card"><p className="eyebrow">테이블 태블릿 화면</p><h2>참여할 테이블을 선택하세요</h2><Select value={selectedTable} onValueChange={setSelectedTable}><SelectTrigger className="table-select"><SelectValue /></SelectTrigger><SelectContent>{TOPICS.map((topic, i) => <SelectItem key={topic} value={String(i + 1)}>{i + 1}. {topic}</SelectItem>)}</SelectContent></Select><div className="selected-topic"><span>TABLE {String(selectedTable).padStart(2, "0")}</span><strong>{TOPICS[Number(selectedTable) - 1]}</strong><p><b>{selectedRemaining}</b>자리 남았습니다</p></div><Button className="attend-button" disabled={busy || selectedRemaining === 0 || data.state.status !== "active"} onClick={() => void act("attend", { tableId: Number(selectedTable) }, "참석이 등록되었습니다.")}><Users />{selectedRemaining === 0 ? "정원이 찼습니다" : data.state.status === "active" ? "참석하기" : "회차 시작을 기다려 주세요"}</Button><p className="helper">한 사람이 누를 때마다 잔여 좌석이 1석 줄어듭니다.</p></section>
        </TabsContent>

        <TabsContent value="materials" className="content-panel">
          <section className="section-heading"><div><p className="eyebrow">운영 자료 모음</p><h2>테이블별 발표 자료</h2></div><span className="subtle">링크는 운영 화면에서 등록</span></section>
          <div className="material-list">{TOPICS.map((topic, i) => { const url = data.materials[String(i + 1)]; return <article key={topic}><span>{String(i + 1).padStart(2, "0")}</span><div><h3>{topic}</h3><p>{url ? "발표 자료가 준비되었습니다." : "자료 준비 중"}</p></div>{url ? <Button asChild variant="outline"><a href={url} target="_blank" rel="noreferrer">자료 열기 <ExternalLink /></a></Button> : <Button variant="outline" disabled>준비 중</Button>}</article>; })}</div>
        </TabsContent>

        <TabsContent value="feedback" className="content-panel feedback-layout">
          <section className="feedback-form"><p className="eyebrow">소통의 시간</p><h2>오늘의 배움을 나눠주세요</h2><Label htmlFor="name">이름 또는 별명</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="익명으로 남겨도 좋아요" maxLength={30} /><Label htmlFor="message">참여 소감</Label><Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="기억에 남은 배움이나 동료에게 전하고 싶은 말을 적어주세요." maxLength={240} /><div className="form-footer"><span>{message.length}/240</span><Button disabled={busy || !message.trim()} onClick={async () => { const result = await act("feedback", { name, message }, "소감이 공유되었습니다."); if (result) setMessage(""); }}>소감 공유하기</Button></div></section>
          <section className="feedback-wall"><div className="wall-heading"><div><p className="eyebrow">실시간 소감</p><h2>{data.feedback.length}개의 이야기</h2></div><MessageCircle /></div>{data.feedback.length === 0 ? <p className="empty-copy">첫 번째 소감을 남겨주세요.</p> : <div className="messages">{data.feedback.map((item) => <article key={item.id} className={item.winner ? "winner-message" : ""}><p>{item.message}</p><span>{item.name}{item.winner ? " · 당첨" : ""}</span></article>)}</div>}</section>
        </TabsContent>

        <TabsContent value="control" className="content-panel control-layout">
          <section className="operator-login"><div><p className="eyebrow">운영자 보호</p><strong>{operatorVerified ? "운영자 인증됨" : "PIN을 입력해야 운영 기능을 사용할 수 있습니다."}</strong></div><Input type="password" value={operatorPin} onChange={(event) => { setOperatorPin(event.target.value); setOperatorVerified(false); }} placeholder="운영자 PIN" aria-label="운영자 PIN" /><Button variant={operatorVerified ? "outline" : "default"} disabled={busy || !operatorPin || operatorVerified} onClick={async () => { const result = await act("verify_operator", {}, "운영자 인증이 완료되었습니다.", operatorPin); if (result) setOperatorVerified(true); }}>{operatorVerified ? "인증 완료" : "인증하기"}</Button></section>
          <section className="control-card"><p className="eyebrow">회차 운영</p><h2>{data.state.currentRound}회차 · {statusLabel(data.state.status)}</h2><div className="clock"><Clock3 /><strong>{mm}:{ss}</strong><span>20분 활동</span></div><div className="control-buttons">{data.state.status === "ready" && <Button onClick={() => void act("start", {}, "1회차를 시작했습니다.", operatorPin)} disabled={busy || !operatorVerified}>1회차 시작</Button>}{data.state.status === "active" && <Button variant="outline" onClick={() => void act("pause", {}, "회차를 마쳤습니다.", operatorPin)} disabled={busy || !operatorVerified}>회차 마치기</Button>}{data.state.status === "break" && data.state.currentRound < 3 && <Button onClick={() => void act("next", {}, `${data.state.currentRound + 1}회차를 시작했습니다.`, operatorPin)} disabled={busy || !operatorVerified}>다음 회차 시작</Button>}{data.state.status === "break" && data.state.currentRound === 3 && <Button onClick={() => setConfirmAction("end")} disabled={busy || !operatorVerified}>전체 활동 종료</Button>}<Button variant="ghost" onClick={() => setConfirmAction("reset")} disabled={busy || !operatorVerified}><RotateCcw />초기화</Button></div><p className="helper">다음 회차를 시작하면 새 회차 좌석 현황이 0명에서 시작됩니다.</p></section>
          <section className="control-card"><p className="eyebrow">자료 링크 등록</p><h2>테이블 발표 자료 연결</h2><Label>테이블</Label><Select value={selectedTable} onValueChange={(value) => { setSelectedTable(value); setMaterialUrl(data.materials[value] || ""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TOPICS.map((topic, i) => <SelectItem key={topic} value={String(i + 1)}>{i + 1}. {topic}</SelectItem>)}</SelectContent></Select><Label htmlFor="material-url">Padlet 또는 자료 주소</Label><Input id="material-url" type="url" value={materialUrl} onChange={(e) => setMaterialUrl(e.target.value)} placeholder="https://" /><Button variant="outline" disabled={busy || !materialUrl || !operatorVerified} onClick={() => void act("material", { tableId: Number(selectedTable), url: materialUrl }, "자료 링크를 저장했습니다.", operatorPin)}>링크 저장</Button></section>
          <section className="control-card raffle-card"><p className="eyebrow">참여자 추첨</p><h2>소감 작성자 중 한 명 뽑기</h2><Gift size={42} /><p>현재 {data.feedback.filter((item) => !item.winner).length}명이 추첨을 기다리고 있습니다.</p><Button disabled={busy || !operatorVerified || data.feedback.filter((item) => !item.winner).length === 0} onClick={async () => { const result = await act("raffle", {}, undefined, operatorPin); const picked = result?.winner as { name: string; message: string } | undefined; if (picked) setWinner(picked); }}>지금 추첨하기</Button></section>
        </TabsContent>
      </Tabs>

      <Dialog open={!!winner} onOpenChange={(open) => !open && setWinner(null)}><DialogContent className="winner-dialog"><DialogHeader><DialogDescription>축하합니다!</DialogDescription><DialogTitle>{winner?.name} 님이 당첨되었습니다</DialogTitle></DialogHeader><Gift size={64} /><blockquote>“{winner?.message}”</blockquote><Button onClick={() => setWinner(null)}>확인</Button></DialogContent></Dialog>
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmAction === "reset" ? "운영 현황을 초기화할까요?" : "모든 활동을 종료할까요?"}</AlertDialogTitle><AlertDialogDescription>{confirmAction === "reset" ? "참석 기록과 참여 소감이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다." : "모든 화면에 활동 종료 안내가 표시됩니다."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => { const action = confirmAction; setConfirmAction(null); if (action) void act(action, {}, action === "reset" ? "운영 현황을 초기화했습니다." : "모든 활동을 종료했습니다.", operatorPin); }}>{confirmAction === "reset" ? "초기화" : "활동 종료"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      {loading && <div className="loading-bar" aria-label="현황 불러오는 중" />}<Toaster position="top-center" richColors />
    </main>
  );
}
