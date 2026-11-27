"use client";

"use client";

import { useRef, useEffect } from "react";

export interface BarDataPoint {
  label: string;
  value: number;
}

export function ChartBar({ data, height = 280 }: { data: BarDataPoint[]; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.parentElement?.clientWidth || 600;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const padding = { top: 20, right: 12, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxValue = Math.max(...data.map((d) => d.value), 1);
    const barWidth = Math.max(2, chartWidth / data.length - 4);

    ctx.clearRect(0, 0, width, height);

    const fontSize = 11;
    ctx.font = `${fontSize}px var(--sans)`;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink-3") || "#6f7b87";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    data.forEach((d, i) => {
      const x = padding.left + i * (chartWidth / data.length) + (chartWidth / data.length) / 2;
      const barHeight = (d.value / maxValue) * chartHeight;
      const y = padding.top + chartHeight - barHeight;

      const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
      gradient.addColorStop(0, getComputedStyle(document.documentElement).getPropertyValue("--sea") || "#1d4e73");
      gradient.addColorStop(1, getComputedStyle(document.documentElement).getPropertyValue("--sea-bg") || "#e5eef5");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - barWidth / 2, y, barWidth, barHeight);

      if (d.value > 0) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink") || "#0f1d2b";
        ctx.fillText(d.value.toString(), x, y - 16);
      }

      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink-3") || "#6f7b87";
      ctx.fillText(d.label, x, padding.top + chartHeight + 6);
    });

    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--line") || "#e2ddd3";
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(width - padding.right, padding.top + chartHeight);
    ctx.stroke();
  }, [data, height]);

  return <canvas ref={canvasRef} role="img" aria-label="Bar chart of reports per day" />;
}

export function ChartPie({
  data,
  height = 280,
}: {
  data: { label: string; value: number; color: string }[];
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.parentElement?.clientWidth || 600;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const radius = Math.min(width, height) / 2 - 40;
    const centerX = width / 2;
    const centerY = height / 2;

    const total = data.reduce((sum, d) => sum + d.value, 0);
    let startAngle = -Math.PI / 2;

    ctx.clearRect(0, 0, width, height);

    const fontSize = 12;
    ctx.font = `${fontSize}px var(--sans)`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    data.forEach((d, i) => {
      const sliceAngle = (d.value / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();

      const midAngle = startAngle + sliceAngle / 2;
      const labelX = centerX + Math.cos(midAngle) * (radius * 0.7);
      const labelY = centerY + Math.sin(midAngle) * (radius * 0.7);
      const percent = ((d.value / total) * 100).toFixed(1);
      ctx.fillStyle = "#fff";
      ctx.fillText(`${d.label} ${percent}%`, labelX, labelY);

      startAngle = endAngle;
    });

    const legendY = centerY + radius + 20;
    const legendX = centerX - data.length * 60;
    ctx.font = "11px var(--sans)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    data.forEach((d, i) => {
      const x = legendX + i * 120;
      ctx.fillStyle = d.color;
      ctx.fillRect(x, legendY - 6, 12, 12);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink-2") || "#44515f";
      ctx.fillText(`${d.label} (${d.value})`, x + 18, legendY);
    });
  }, [data, height]);

  return <canvas ref={canvasRef} role="img" aria-label="Pie chart of tier distribution" />;
}