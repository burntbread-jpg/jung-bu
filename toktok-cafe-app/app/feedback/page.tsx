"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

export default function MobileFeedbackPage() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submitFeedback() {
    if (!message.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "feedback", name, message }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "소감을 등록하지 못했습니다.");
      setSubmitted(true);
      setMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "소감을 등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mobile-feedback-page">
      <header className="mobile-feedback-header">
        <Link href="/" aria-label="행사 화면으로 돌아가기"><ArrowLeft /></Link>
        <div className="mobile-feedback-brand">
          <Image src="/jungbu-office-symbol.png" alt="" width={320} height={320} priority />
          <div><strong>수업나눔 톡톡!카페</strong><span>서울특별시중부교육지원청</span></div>
        </div>
      </header>

      <section className="mobile-feedback-card">
        {submitted ? (
          <div className="mobile-feedback-success" role="status">
            <CheckCircle2 />
            <p className="eyebrow">THANK YOU</p>
            <h1>소감이 공유되었습니다</h1>
            <p>오늘의 배움을 함께 나눠주셔서 감사합니다.</p>
            <Button onClick={() => setSubmitted(false)}>소감 하나 더 남기기</Button>
          </div>
        ) : (
          <>
            <p className="eyebrow">2026 수업 나눔의 날</p>
            <h1>오늘의 배움을<br />남겨주세요</h1>
            <p className="mobile-feedback-intro">새롭게 발견한 점이나 내 수업에 적용하고 싶은 생각을 천천히 적어주세요.</p>
            <div className="mobile-feedback-form">
              <div className="mobile-feedback-field-heading"><Label htmlFor="mobile-message">참여 소감</Label><span>필수</span></div>
              <p className="mobile-feedback-prompts">새롭게 알게 된 점 · 적용해 보고 싶은 점 · 함께 나누고 싶은 생각</p>
              <Textarea id="mobile-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder={"오늘 가장 기억에 남은 장면은 무엇인가요?\n그 배움을 내 교실에서는 어떻게 이어가고 싶나요?"} maxLength={500} rows={10} />
              <div className="mobile-feedback-count"><span>부적절한 표현은 자동으로 가려집니다.</span><strong>{message.length}/500</strong></div>
              <Label htmlFor="mobile-name">이름 또는 별명 <span>선택</span></Label>
              <Input id="mobile-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="비워두면 익명으로 등록돼요" maxLength={30} autoComplete="nickname" />
              <Button disabled={busy || !message.trim()} onClick={() => void submitFeedback()}>{busy ? "공유하는 중..." : <><Send />소감 공유하기</>}</Button>
              <p className="mobile-feedback-disclosure">작성한 소감은 행사 화면에 바로 공유되며 추첨 대상에 포함됩니다.</p>
            </div>
          </>
        )}
      </section>
      <footer>수업나눔 톡톡!카페</footer>
      <Toaster position="top-center" richColors />
    </main>
  );
}
