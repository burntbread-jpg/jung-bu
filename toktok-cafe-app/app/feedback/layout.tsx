import type { Metadata } from "next";
import "./mobile-feedback.css";

export const metadata: Metadata = {
  title: "참여 소감 | 수업나눔 톡톡!카페",
  description: "2026 수업 나눔의 날 참여 소감을 작성하는 모바일 화면",
};

export default function FeedbackLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
