import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import mermaid from 'mermaid';
import { sanitizeMermaid } from '../domain/ai';
import { usePalette } from '../theme/usePalette';

type Props = {
  definition: string;
  zoom?: number;
  expanded?: boolean;
  onPress?: () => void;
};

export function MermaidRenderer({ definition, zoom = 1, expanded = false, onPress }: Props) {
  const palette = usePalette();
  const scheme = useColorScheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const safeDefinition = useMemo(() => {
    try {
      return sanitizeMermaid(definition);
    } catch (err) {
      return err instanceof Error ? err : null;
    }
  }, [definition]);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      if (safeDefinition instanceof Error || safeDefinition === null) {
        setSvg(null);
        setError(safeDefinition instanceof Error ? safeDefinition.message : 'Mermaid definition is invalid.');
        return;
      }
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: scheme === 'dark' ? 'dark' : 'default',
        flowchart: {
          htmlLabels: false,
          useMaxWidth: true,
        },
      });
      try {
        const id = `blink_mermaid_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const result = await Promise.race([
          mermaid.render(id, safeDefinition),
          new Promise<{ svg: string }>((resolve) => {
            setTimeout(() => resolve({ svg: renderSafeFallbackSvg(safeDefinition) }), 900);
          }),
        ]);
        if (!cancelled) {
          setSvg(result.svg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSvg(null);
          setError(err instanceof Error ? err.message : 'Mermaid render failed.');
        }
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [safeDefinition, scheme]);

  if (error) {
    return (
      <View style={[styles.errorBox, { backgroundColor: palette.fill }]}>
        <Text style={[styles.errorText, { color: palette.red }]}>Graph unavailable: {error}</Text>
      </View>
    );
  }

  if (!svg) {
    return (
      <View style={[styles.loading, { backgroundColor: palette.fill }]}>
        <Text style={{ color: palette.secondaryText }}>Rendering graph...</Text>
      </View>
    );
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="View full graph" onPress={onPress} disabled={!onPress}>
      {/*
        Mermaid is rendered from a definition that passed sanitizeMermaid and Mermaid
        strict mode. The injected markup is Mermaid's SVG output, not AI HTML.
      */}
      <div
        data-testid="mermaid-graph"
        style={{
          overflow: 'auto',
          width: '100%',
          maxHeight: expanded ? 'none' : 320,
          borderRadius: 14,
          background: palette.card,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </Pressable>
  );
}

function renderSafeFallbackSvg(definition: string): string {
  const lines = definition.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const direction = /\sLR$/i.test(lines[0] ?? '') ? 'LR' : 'TD';
  const edges = lines.slice(1).map((line) => {
    const [fromRaw, toRaw] = line.split(/-->|---|-.->|==>/).map((part) => part.trim());
    return fromRaw && toRaw ? { from: parseNode(fromRaw), to: parseNode(toRaw) } : null;
  }).filter((edge): edge is { from: NodeInfo; to: NodeInfo } => Boolean(edge));
  const nodes = new Map<string, string>();
  for (const edge of edges) {
    nodes.set(edge.from.id, edge.from.label);
    nodes.set(edge.to.id, edge.to.label);
  }
  const nodeList = [...nodes.entries()];
  const width = direction === 'LR' ? Math.max(360, nodeList.length * 170) : 420;
  const height = direction === 'LR' ? 220 : Math.max(220, nodeList.length * 96);
  const positions = new Map<string, { x: number; y: number }>();
  nodeList.forEach(([id], index) => {
    positions.set(id, direction === 'LR'
      ? { x: 90 + index * 160, y: 100 }
      : { x: width / 2, y: 56 + index * 88 });
  });
  const edgeSvg = edges.map((edge) => {
    const from = positions.get(edge.from.id);
    const to = positions.get(edge.to.id);
    if (!from || !to) {
      return '';
    }
    const x1 = direction === 'LR' ? from.x + 56 : from.x;
    const y1 = direction === 'LR' ? from.y : from.y + 24;
    const x2 = direction === 'LR' ? to.x - 56 : to.x;
    const y2 = direction === 'LR' ? to.y : to.y - 24;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8E8E93" stroke-width="2" marker-end="url(#arrow)" />`;
  }).join('');
  const nodeSvg = nodeList.map(([id, label]) => {
    const pos = positions.get(id)!;
    return [
      `<rect x="${pos.x - 62}" y="${pos.y - 24}" width="124" height="48" rx="12" fill="#F2F2F7" stroke="#C7C7CC" />`,
      `<text x="${pos.x}" y="${pos.y + 5}" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#111111" text-anchor="middle">${escapeXml(label)}</text>`,
    ].join('');
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid flowchart"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#8E8E93"/></marker></defs>${edgeSvg}${nodeSvg}</svg>`;
}

type NodeInfo = {
  id: string;
  label: string;
};

function parseNode(raw: string): NodeInfo {
  const match = /^([A-Za-z][A-Za-z0-9_-]{0,32})(?:\[([^\]]+)\]|\(([^\)]+)\))?/.exec(raw);
  return {
    id: match?.[1] ?? raw.slice(0, 12),
    label: match?.[2] ?? match?.[3] ?? match?.[1] ?? raw.slice(0, 24),
  };
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

const styles = StyleSheet.create({
  errorBox: {
    borderRadius: 14,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  loading: {
    minHeight: 120,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
