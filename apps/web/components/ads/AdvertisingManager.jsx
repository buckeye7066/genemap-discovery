import React, { useEffect, useState } from 'react';
import { adRequest } from './Advertisement';

const localDate = (date) => {
  const value = new Date(date);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export function runEnd(start, period) {
  const date = new Date(start);
  if (!Number.isFinite(date.getTime())) return '';
  if (period === 'month') {
    const day = date.getDate();
    date.setDate(1); date.setMonth(date.getMonth() + 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
  }
  else date.setDate(date.getDate() + (period === 'two-weeks' ? 14 : 7));
  return localDate(date);
}
const emptyForm = () => ({ advertiser: '', headline: '', body: '', targetUrl: '', seconds: 15, startsAt: localDate(new Date()), endsAt: runEnd(new Date(), 'week'), paused: true });
const fileData = (file) => new Promise((resolve, reject) => {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) return reject(new Error('Each image must be PNG, JPEG, or WebP under 2 MB.'));
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Image could not be read.'));
  reader.readAsDataURL(file);
});
const payload = (form) => ({ ...form, seconds: Number(form.seconds), startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() });
const inputClass = 'block w-full rounded border border-slate-300 p-2 text-sm bg-white';
function StatsTable({ rows, label }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm text-left"><caption className="text-left font-medium py-2">{label}</caption><thead><tr><th scope="col">Date / creative</th><th scope="col">Impressions</th><th scope="col">Clicks</th><th scope="col">Unique viewers</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id || row.day}><th scope="row" className="font-normal py-1 pr-3">{row.label || row.day}</th><td>{row.impressions}</td><td>{row.clicks}</td><td>{row.viewers}</td></tr>)}</tbody></table>{!rows.length && <p className="text-sm text-slate-500 py-2">No measured activity yet.</p>}</div>;
}
export default function AdvertisingManager({ onChange }) {
  const [creatives, setCreatives] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [files, setFiles] = useState([]);
  const [fileKey, setFileKey] = useState(0);
  const [period, setPeriod] = useState('week');
  const [secondsChoice, setSecondsChoice] = useState('15');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => {
    const [ads, counts] = await Promise.all([adRequest('/manage'), adRequest('/manage/stats')]);
    setCreatives(ads.creatives); setStats(counts);
  };
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  const reset = () => { setEditing(null); setForm(emptyForm()); setFiles([]); setFileKey((key) => key + 1); setPeriod('week'); setSecondsChoice('15'); };
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value, ...(key === 'startsAt' && value && period !== 'custom' ? { endsAt: runEnd(value, period) } : {}) }));
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    let saved = 0;
    try {
      if (!editing && !files.length) throw new Error('Choose at least one image.');
      if (files.length > (editing ? 1 : 10)) throw new Error(editing ? 'Choose one replacement image.' : 'Upload at most 10 images at a time.');
      const data = payload(form);
      // Validate every file before starting the batch. Each successful upload is
      // a separate creative; partial server failures report the exact count.
      const images = await Promise.all(files.map(fileData));
      if (editing) {
        await adRequest(`/manage/${editing}`, 'PUT', { ...data, ...(images.length ? { image: images[0] } : {}) });
        saved = 1;
      } else {
        for (const image of images) { await adRequest('/manage', 'POST', { ...data, image }); saved++; }
      }
      reset(); setMessage(`${saved} advertisement${saved === 1 ? '' : 's'} saved.`);
    } catch (error) {
      if (saved) { setFiles((previous) => previous.slice(saved)); setFileKey((key) => key + 1); }
      setMessage(`${saved ? `${saved} saved; remaining uploads were not saved. ` : ''}${error.message}`);
    } finally {
      try { await load(); onChange(); } catch { setMessage((previous) => `${previous} Could not refresh advertisements.`); }
      setBusy(false);
    }
  };
  const action = async (ad, remove = false) => {
    if (remove && !window.confirm(`Remove “${ad.headline}”? Its image will be removed; aggregate statistics remain.`)) return;
    setBusy(true); setMessage('');
    try {
      if (remove) await adRequest(`/manage/${ad.id}`, 'DELETE');
      else { const { id: _id, revision: _revision, ...data } = ad; await adRequest(`/manage/${ad.id}`, 'PUT', { ...data, paused: !ad.paused }); }
      await load(); onChange();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <section className="bg-white rounded-xl border border-blue-200 p-4 space-y-4 mb-4" aria-label="Manage advertisements">
    <h2 className="font-semibold text-lg">Advertisements</h2>
    <p className="text-sm text-slate-600">Each uploaded image becomes a separate rotating advertisement. Images and schedules are saved across devices. Times use your local time zone.</p>
    <form onSubmit={save} className="grid sm:grid-cols-2 gap-3">
      <fieldset disabled={busy} className="contents">
        <label className="text-sm">Advertiser<input className={inputClass} required maxLength={100} value={form.advertiser} onChange={(event) => change('advertiser', event.target.value)} /></label>
        <label className="text-sm">Headline<input className={inputClass} required maxLength={160} value={form.headline} onChange={(event) => change('headline', event.target.value)} /></label>
        <label className="text-sm sm:col-span-2">Description<textarea className={inputClass} maxLength={1000} value={form.body} onChange={(event) => change('body', event.target.value)} /></label>
        <label className="text-sm sm:col-span-2">Advertiser link (HTTPS)<input className={inputClass} required type="url" pattern="https://.*" maxLength={2048} value={form.targetUrl} onChange={(event) => change('targetUrl', event.target.value)} /></label>
        <label className="text-sm">Display time<select className={inputClass} value={secondsChoice} onChange={(event) => { setSecondsChoice(event.target.value); if (event.target.value !== 'custom') change('seconds', Number(event.target.value)); }}><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="custom">Custom</option></select></label>
        {secondsChoice === 'custom' && <label className="text-sm">Seconds (5–300)<input className={inputClass} required type="number" min={5} max={300} value={form.seconds} onChange={(event) => change('seconds', event.target.value)} /></label>}
        <label className="text-sm">Run length<select className={inputClass} value={period} onChange={(event) => { const value = event.target.value; setPeriod(value); if (value !== 'custom') change('endsAt', runEnd(form.startsAt, value)); }}><option value="week">One week</option><option value="two-weeks">Two weeks</option><option value="month">One month</option><option value="custom">Custom dates</option></select></label>
        <label className="text-sm">Starts<input className={inputClass} required type="datetime-local" value={form.startsAt} onChange={(event) => change('startsAt', event.target.value)} /></label>
        <label className="text-sm">Ends<input className={inputClass} required type="datetime-local" value={form.endsAt} onChange={(event) => { setPeriod('custom'); change('endsAt', event.target.value); }} /></label>
        <label className="text-sm sm:col-span-2">{editing ? 'Replace image (optional)' : 'Images (up to 10)'}<input key={fileKey} className={inputClass} type="file" accept="image/png,image/jpeg,image/webp" multiple={!editing} onChange={(event) => setFiles(Array.from(event.target.files || []))} /><span className="text-xs text-slate-500">PNG, JPEG, WebP · 2 MB each · maximum 4096 × 4096 · still images only</span></label>
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={!form.paused} onChange={(event) => change('paused', !event.target.checked)} />Publish during scheduled dates</label>
        <div className="flex gap-3"><button type="submit" className="rounded bg-blue-700 text-white px-4 py-2">{busy ? 'Saving…' : editing ? 'Save changes' : 'Save advertisements'}</button>{editing && <button type="button" onClick={reset} className="underline">Cancel edit</button>}</div>
      </fieldset>
    </form>
    <p role="status" className="text-sm">{message}</p>
    <h3 className="font-medium">Saved advertisements</h3>
    {!creatives.length && <p className="text-sm text-slate-500">No advertisements yet.</p>}
    {creatives.map((ad) => <div key={ad.id} className="border-t pt-3 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 break-words"><strong>{ad.headline}</strong><p className="text-sm text-slate-500">{ad.advertiser} · {ad.paused ? 'Paused' : Date.parse(ad.endsAt) <= Date.now() ? 'Ended' : Date.parse(ad.startsAt) > Date.now() ? 'Scheduled' : 'Published'} · {ad.seconds}s</p><p className="text-xs text-slate-500">{new Date(ad.startsAt).toLocaleString()} – {new Date(ad.endsAt).toLocaleString()}</p></div><div className="flex gap-3 text-sm"><button disabled={busy} className="underline p-2" onClick={() => { const { id, revision: _revision, ...data } = ad; setEditing(id); setForm({ ...data, startsAt: localDate(data.startsAt), endsAt: localDate(data.endsAt) }); setPeriod('custom'); setSecondsChoice([15, 30].includes(ad.seconds) ? String(ad.seconds) : 'custom'); setFiles([]); setFileKey((key) => key + 1); }}>Edit</button><button disabled={busy} className="underline p-2" onClick={() => action(ad)}>{ad.paused ? 'Resume' : 'Pause'}</button><button disabled={busy} className="text-red-700 underline p-2" onClick={() => action(ad, true)}>Remove</button></div></div>)}
    {stats && <div className="space-y-3 border-t pt-4"><h3 className="font-medium">Measured performance</h3><p className="text-sm">{stats.totals.impressions} impressions · {stats.totals.clicks} clicks · {stats.totals.viewers} unique viewers</p><p className="text-xs text-slate-500">An impression requires at least one second with half the ad visible in the foreground. Repeat events are deduplicated. Unique viewers count anonymous browser installations, not people; clearing browser storage resets that identifier. Owner previews are excluded. No health, genetic, profile, or search data is used.</p><StatsTable label="By creative · all time" rows={stats.creatives.map((row) => ({ ...row, label: creatives.find((ad) => ad.id === row.id)?.headline || 'Removed advertisement' }))} /><StatsTable label="Daily · last 90 days (UTC)" rows={stats.daily} /><button disabled={busy} className="text-sm underline p-2" onClick={() => load().catch((error) => setMessage(error.message))}>Refresh statistics</button></div>}
  </section>;
}
