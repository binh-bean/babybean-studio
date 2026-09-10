"use client";

import React, { useState } from "react";
import { vi } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Loader2, Link as LinkIcon, CheckCircle2, ChevronRight, Copy } from "lucide-react";

interface PreviewData {
  folderName: string;
  fileCount: number;
  sample: { thumbnailUrl: string }[];
}

interface ResultData {
  link: string;
  qr: string;
  babyName: string;
  deadline: string;
}

export function CreateGalleryWizard() {
  const [step, setStep] = useState(1);
  const [isChecking, setIsChecking] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);

  const handleCheckDrive = () => {
    setIsChecking(true);
    // Mock API call
    setTimeout(() => {
      setIsChecking(false);
      setPreviewData({
        folderName: "2026-09-01 Bé Bơ 3 tháng",
        fileCount: 862,
        sample: Array(6).fill({ thumbnailUrl: "https://placehold.co/100x100?text=IMG" })
      });
    }, 1500);
  };

  const handleSubmit = () => {
    setIsSubmitting(true);
    // Mock API call
    setTimeout(() => {
      setIsSubmitting(false);
      setResult({
        link: "https://babybean.studio/g/mock123",
        qr: "mock_qr",
        babyName: "Bé Bơ 3 tháng",
        deadline: "20/09/2026"
      });
      setStep(4);
    }, 1500);
  };

  if (step === 4 && result) {
    const msg = vi.admin.wizard.sampleMessage
      .replace("{babyName}", result.babyName)
      .replace("{link}", result.link)
      .replace("{deadline}", result.deadline);

    return (
      <Card className="max-w-2xl mx-auto mt-8">
        <CardHeader className="text-center pb-2">
          <CheckCircle2 className="w-12 h-12 text-[var(--bb-success)] mx-auto mb-4" />
          <CardTitle className="text-2xl">{vi.admin.wizard.successTitle}</CardTitle>
          <CardDescription>{vi.admin.wizard.linkReady}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-col items-center p-6 bg-[var(--bb-surface-2)] rounded-[var(--bb-radius)]">
            <div className="w-40 h-40 bg-white border border-[var(--bb-border)] flex items-center justify-center rounded mb-4">
              <span className="text-[var(--bb-fg-muted)]">QR Code</span>
            </div>
            <code className="text-sm bg-white px-3 py-2 border border-[var(--bb-border)] rounded w-full text-center mb-4">
              {result.link}
            </code>
            <Button className="w-full sm:w-auto">
              <Copy className="w-4 h-4 mr-2" />
              {vi.admin.wizard.copyLinkCta}
            </Button>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{vi.admin.wizard.copyMessageCta}</label>
            <div className="relative">
              <textarea 
                className="w-full h-32 p-3 text-sm rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface)] resize-none"
                readOnly
                value={msg}
              />
              <Button variant="secondary" size="sm" className="absolute bottom-3 right-3">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Stepper */}
      <div className="flex items-center mb-8 w-full">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`flex items-center ${s < 3 ? "flex-1" : ""}`}>
            <div className={`w-8 h-8 rounded-full flex shrink-0 items-center justify-center font-medium ${
              step >= s ? "bg-[var(--bb-primary)] text-white" : "bg-[var(--bb-surface-2)] text-[var(--bb-fg-muted)]"
            }`}>
              {s}
            </div>
            {s < 3 && <div className={`h-1 mx-2 w-full rounded ${
              step > s ? "bg-[var(--bb-primary)]" : "bg-[var(--bb-surface-2)]"
            }`} />}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1 && vi.admin.wizard.stepSource}
            {step === 2 && vi.admin.wizard.stepInfo}
            {step === 3 && vi.admin.wizard.stepRules}
          </CardTitle>
          <CardDescription>
            {step === 1 && vi.admin.wizard.driveLinkDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">{vi.admin.wizard.driveLinkTitle}</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--bb-fg-muted)]" />
                    <Input placeholder={vi.admin.wizard.driveLinkPlaceholder} className="pl-9" />
                  </div>
                  <Button onClick={handleCheckDrive} disabled={isChecking}>
                    {isChecking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {isChecking ? vi.admin.wizard.checkingDrive : vi.admin.wizard.checkDriveLink}
                  </Button>
                </div>
              </div>

              {previewData && (
                <div className="p-4 bg-[var(--bb-surface-2)] rounded-[var(--bb-radius)] space-y-4">
                  <h4 className="font-medium text-sm">
                    {vi.admin.wizard.drivePreviewTitle.replace("{count}", previewData.fileCount.toString())}
                  </h4>
                  <p className="text-sm text-[var(--bb-fg-muted)]">{previewData.folderName}</p>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {previewData.sample.map((s: { thumbnailUrl: string }, i: number) => (
                      <div key={i} className="aspect-square rounded-[var(--bb-radius-sm)] overflow-hidden bg-white border border-[var(--bb-border)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.thumbnailUrl} alt="preview" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">{vi.admin.wizard.customerTitle}</label>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input placeholder={vi.admin.wizard.searchCustomer} />
                  <Input placeholder={vi.admin.wizard.createCustomer} />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{vi.admin.wizard.babyName}</label>
                  <Input />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{vi.admin.wizard.shootDate}</label>
                  <Input type="date" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{vi.admin.wizard.photographer}</label>
                  <Select>
                    <option value="">Chọn thợ</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{vi.admin.wizard.packageSelect}</label>
                  <Select>
                    <option value="">Chọn gói</option>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{vi.admin.wizard.quota}</label>
                  <Input type="number" defaultValue={20} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{vi.admin.wizard.extraPrice}</label>
                  <Input type="number" defaultValue={50000} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{vi.admin.wizard.deadline}</label>
                  <Input type="number" defaultValue={7} />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-[var(--bb-border)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{vi.admin.wizard.pinRequired}</p>
                    <p className="text-sm text-[var(--bb-fg-muted)]">Tăng bảo mật cho album</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{vi.admin.wizard.watermark}</p>
                    <p className="text-sm text-[var(--bb-fg-muted)]">Hiện mờ trên ảnh gốc</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{vi.admin.wizard.allowDownload}</p>
                    <p className="text-sm text-[var(--bb-fg-muted)]">Cho tải ảnh khi chưa chốt</p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{vi.admin.wizard.allowInvite}</p>
                    <p className="text-sm text-[var(--bb-fg-muted)]">Mời nhiều người cùng chọn</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </div>
          )}
        </CardContent>
        
        <CardFooter className="flex justify-between border-t border-[var(--bb-border)] pt-6">
          <Button 
            variant="outline" 
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1 || isSubmitting}
          >
            {vi.common.back}
          </Button>
          
          {step < 3 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !previewData}>
              Tiếp tục
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Tạo album
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
