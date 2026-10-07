import React, { useState } from 'react';
import { AggregateTable } from '../AggregateTable.jsx';
import { tableState } from '../data.js';

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fileSlug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

export function ChartFrame({ title, subtitle, table, columns = [], children, onSelect, extraColumns = [], denominatorDescription = 'selected sessions' }) {
  const [mode, setMode] = useState('chart');
  const [exportStatus, setExportStatus] = useState('');
  const state = tableState(table);
  const unit = table?.unit?.replaceAll('_', ' ') || 'aggregate measure';
  const denominator = table?.cells?.find((cell) => !cell.suppressed)?.denominator;
  const metricNote = `Unit: ${unit}${denominator == null ? '' : `; denominator: ${denominatorDescription} (cell n = ${denominator})`}.`;
  const exportCsv = () => {
    const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [
      ['Chart', title],
      ['Synthetic caveat', 'Synthetic demo: not real student data. Aggregates are descriptive and do not establish diagnosis, prevalence, or real-world need.'],
      ['Applied filters', JSON.stringify(table?.filters_applied || {})],
      ['Dimensions', 'Value', 'Numerator', 'Denominator', 'Suppressed'],
      ...(table?.cells || []).map((cell) => [Object.entries(cell.dimensions || {}).map(([key, value]) => `${key}=${value}`).join('; '), cell.value, cell.numerator, cell.denominator, Boolean(cell.suppressed)]),
    ];
    saveBlob(new Blob([rows.map((row) => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${fileSlug(title)}.csv`);
    setExportStatus('Aggregate CSV downloaded with the synthetic caveat and applied filter context.');
  };
  const exportPng = () => {
    const frame = [...document.querySelectorAll('.chart-frame')].find((node) => node.getAttribute('aria-label') === title);
    const svg = frame?.querySelector('.chart-frame-visual svg');
    if (!svg) { setExportStatus('PNG export is available for SVG charts. Use Table or CSV for this chart.'); return; }
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const source = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => {
      const viewBox = svg.viewBox?.baseVal;
      const width = Math.max(720, viewBox?.width || image.width || 1200);
      const height = Math.max(260, viewBox?.height || image.height || 600);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height + 108;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fcfcfb'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#131714'; context.font = '600 22px Arial'; context.fillText(title, 22, 30);
      context.font = '13px Arial'; context.fillText(frame.querySelector('.chart-frame-heading .muted')?.textContent || metricNote, 22, 51, width - 44);
      context.drawImage(image, 0, 66, width, height);
      context.fillStyle = '#245c44'; context.font = '600 14px Arial'; context.fillText('Synthetic demo: not real student data', 22, height + 88);
      context.fillStyle = '#54615a'; context.font = '12px Arial'; context.fillText('Descriptive synthetic aggregate only; not a diagnosis, prevalence estimate, or real-world evidence.', 22, height + 104, width - 44);
      canvas.toBlob((blob) => { if (blob) saveBlob(blob, `${fileSlug(title)}.png`); });
      URL.revokeObjectURL(url);
      setExportStatus('PNG downloaded with the title and synthetic caveat.');
    };
    image.onerror = () => { URL.revokeObjectURL(url); setExportStatus('PNG could not be rendered by this browser. Use CSV export.'); };
    image.src = url;
  };
  return <section className="chart-panel chart-frame" aria-label={title}>
    <header className="chart-frame-heading">
      <div><h3>{title}</h3><p className="muted">{subtitle ? `${subtitle} ${metricNote}` : metricNote}</p></div>
      <div className="chart-mode-toggle" role="group" aria-label={`${title} display mode`}>
        <button type="button" aria-pressed={mode === 'chart'} onClick={() => setMode('chart')}>Chart</button>
        <button type="button" aria-pressed={mode === 'table'} onClick={() => setMode('table')}>Table</button>
        <button type="button" onClick={exportPng}>PNG</button>
        <button type="button" onClick={exportCsv}>CSV</button>
      </div>
    </header>
    {exportStatus && <p role="status" className="muted">{exportStatus}</p>}
    {state === 'suppressed' || state === 'partially_suppressed' ? <p className="suppression-note">Insufficient group size. Hidden values are not shown as zero.</p> : null}
    {mode === 'chart' ? <div className="chart-frame-visual">{children}<span className="chart-watermark" aria-label="Synthetic data">Synthetic demo</span></div>
      : <AggregateTable title={title} table={table} columns={columns} extraColumns={extraColumns} onSelect={onSelect} />}
  </section>;
}
