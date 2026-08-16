"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, ISeriesApi, Time } from "lightweight-charts";
import { useTheme } from "@/components/theme-provider";

export interface EquityDataPoint {
  time: string; // "YYYY-MM-DD"
  value: number;
}

interface EquityChartProps {
  data: EquityDataPoint[];
}

export function EquityChart({ data }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const { resolved } = useTheme();
  
  const isDark = resolved === "dark";

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)",
      },
      grid: {
        vertLines: { color: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)" },
        horzLines: { color: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)" },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
      },
      rightPriceScale: {
        borderVisible: false,
      },
      crosshair: {
        mode: 1, // Magnet
      },
      handleScroll: false,
      handleScale: false,
    });
    
    chartRef.current = chart;

    const series = chart.addAreaSeries({
      lineColor: isDark ? "#3b82f6" : "#2563eb", // Tailwind Blue 500/600
      topColor: isDark ? "rgba(59, 130, 246, 0.4)" : "rgba(37, 99, 235, 0.4)",
      bottomColor: isDark ? "rgba(59, 130, 246, 0.0)" : "rgba(37, 99, 235, 0.0)",
      lineWidth: 2,
    });
    seriesRef.current = series;

    // Lightweight charts requires strictly ascending time values
    const sortedData = [...data].sort((a, b) => a.time.localeCompare(b.time));
    
    // Convert string time to Lightweight Charts Time format if needed, 
    // but lightweight charts accepts "YYYY-MM-DD" as a string
    series.setData(sortedData as any);

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, isDark]);

  return (
    <div className="w-full h-full relative" ref={chartContainerRef} />
  );
}
