"use client";

import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

import type { Candle } from "@/lib/market-data/types";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export interface PriceLine {
  price: number;
  label: string;
  colour: "green" | "red" | "blue";
  dashed?: boolean;
}

/** Resolved from CSS variables so the chart tracks the app's theme exactly. */
function readThemeColours(isDark: boolean) {
  const styles = getComputedStyle(document.documentElement);
  const rgb = (name: string, alpha = 1) => {
    const value = styles.getPropertyValue(name).trim();
    return value ? `rgba(${value.split(" ").join(", ")}, ${alpha})` : "rgba(128,128,128,1)";
  };

  return {
    background: "transparent",
    text: rgb("--label-secondary", isDark ? 0.6 : 0.55),
    grid: rgb("--chart-grid", isDark ? 0.5 : 1),
    up: rgb("--sys-green"),
    down: rgb("--sys-red"),
    volumeUp: rgb("--sys-green", 0.35),
    volumeDown: rgb("--sys-red", 0.35),
    blue: rgb("--sys-blue"),
    green: rgb("--sys-green"),
    red: rgb("--sys-red"),
  };
}

export function CandleChart({
  candles,
  priceLines = [],
  height = 320,
  className,
}: {
  candles: Candle[];
  priceLines?: PriceLine[];
  height?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const { resolved } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isDark = resolved === "dark";
    const colours = readThemeColours(isDark);

    const chart = createChart(container, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: colours.background },
        textColor: colours.text,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", system-ui, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: colours.grid, style: 1 },
        horzLines: { color: colours.grid, style: 1 },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.26 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
        rightOffset: 4,
        // Enough room that the price lines' labels don't overlap the last bar.
        barSpacing: 6,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { labelBackgroundColor: colours.blue },
        horzLine: { labelBackgroundColor: colours.blue },
      },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
      autoSize: false,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: colours.up,
      downColor: colours.down,
      borderUpColor: colours.up,
      borderDownColor: colours.down,
      wickUpColor: colours.up,
      wickDownColor: colours.down,
      priceFormat: { type: "price", precision: 2, minMove: 0.05 },
    });

    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    // Volume in its own scale pinned to the bottom quarter.
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? colours.volumeUp : colours.volumeDown,
      })),
    );

    for (const line of priceLines) {
      candleSeries.createPriceLine({
        price: line.price,
        color:
          line.colour === "green" ? colours.green : line.colour === "red" ? colours.red : colours.blue,
        lineWidth: 1,
        lineStyle: line.dashed ? 2 : 0,
        axisLabelVisible: true,
        title: line.label,
      });
    }

    chart.timeScale().fitContent();

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    setReady(true);

    const resize = () => chart.applyOptions({ width: container.clientWidth });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
    // Rebuilt on theme change: lightweight-charts has no single call to restyle
    // every series, and a full rebuild is cheap at this data size.
  }, [candles, priceLines, height, resolved]);

  return (
    <div className={cn("relative w-full", className)}>
      <div ref={containerRef} className="w-full" style={{ height }} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-footnote text-label-secondary/50">Loading chart…</span>
        </div>
      )}
    </div>
  );
}
