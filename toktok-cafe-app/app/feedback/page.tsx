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
        <Image src="/jungbu-office-logo.png" alt="서울특별시중부교육지원청" width={2168} height={725} priority />
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
            <h1>오늘의 배움을<br />들려주세요</h1>
            <p className="mobile-feedback-intro">짧은 한마디도 좋아요. 작성한 소감은 행사 화면에 바로 공유되며 추첨에도 자동으로 참여합니다.</p>
            <div className="mobile-feedback-form">
              <Label htmlFor="mobile-name">이름 또는 별명</Label>
              <Input id="mobile-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="익명으로 남겨도 좋아요" maxLength={30} autoComplete="nickname" />
              <Label htmlFor="mobile-message">참여 소감</Label>
              <Textarea id="mobile-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="기억에 남은 배움이나 동료에게 전하고 싶은 말을 적어주세요." maxLength={240} autoFocus />
              <div className="mobile-feedback-count"><span>{message.length}/240</span><span>부적절한 표현은 자동으로 가려집니다.</span></div>
              <Button disabled={busy || !message.trim()} onClick={() => void submitFeedback()}>{busy ? "공유하는 중..." : <><Send />소감 공유하기</>}</Button>
            </div>
          </>
        )}
      </section>
      <footer>수업나눔 톡톡!카페</footer>
      <Toaster position="top-center" richColors />
    </main>
  );
}
