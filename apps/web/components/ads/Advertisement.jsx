import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@genemap/shared';
import { useAuth } from '@/lib/AuthContext';
import AdvertisingManager from './AdvertisingManager';

export const adRequest = (path, method = 'GET', body) => apiClient.request(`/advertising${path}`, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
function viewerId() {
  try {
    let id = localStorage.getItem('genemap.adViewer');
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) {
      id = crypto.randomUUID();
      localStorage.setItem('genemap.adViewer', id);
    }
    return id;
  } catch { return crypto.randomUUID(); }
}
export const advertisementHref = (ad) => window.electronAPI?.isElectron
  ? `${apiClient.baseURL}/advertising-link/${encodeURIComponent(ad.id)}`
  : ad.targetUrl;
export const liveCreatives = (ads, now = Date.now()) => ads.filter((ad) => !ad.paused && Date.parse(ad.startsAt) <= now && Date.parse(ad.endsAt) > now);

export default function Advertisement() {
  const { user } = useAuth();
  const [ads, setAds] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [manage, setManage] = useState(false);
  const [index, setIndex] = useState(0);
  const [image, setImage] = useState(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(document.visibilityState === 'visible');
  const [clock, setClock] = useState(Date.now());
  const [rotationPaused, setRotationPaused] = useState(false);
  const [linkFocused, setLinkFocused] = useState(false);
  const box = useRef(null);
  const measurement = useRef(null);
  const viewer = useRef(null);
  const live = liveCreatives(ads, clock);
  const ad = live[index % Math.max(live.length, 1)];
  const reload = useCallback(() => adRequest('/feed').then((data) => setAds(data.creatives)).catch(() => setAds([])), []);

  useEffect(() => {
    setCanManage(false); setManage(false); setAds([]);
    if (!user?.id) return;
    let current = true;
    adRequest('/capability').then((data) => { if (current) setCanManage(data.canManage === true); }).catch(() => {});
    reload();
    const poll = setInterval(reload, 60_000);
    return () => { current = false; clearInterval(poll); };
  }, [user?.id, reload]);
  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 1000);
    const visibility = () => setForeground(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    setImage(null); setReady(false); measurement.current = null;
    if (!ad) return;
    let current = true;
    adRequest(`/${ad.id}/image`).then((data) => { if (current) setImage(data.image); }).catch(() => {});
    return () => { current = false; };
  }, [ad?.id, ad?.revision]);
  useEffect(() => {
    setVisible(false);
    if (!box.current || !ad || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [ad?.id]);
  useEffect(() => {
    if (!ad || !ready || !visible || !foreground || canManage) return;
    let current = true;
    let timer;
    measurement.current = null;
    viewer.current ||= viewerId();
    adRequest(`/${ad.id}/display`, 'POST', { viewer: viewer.current }).then(({ ticket }) => {
      if (!current || !ticket) return;
      timer = setTimeout(() => {
        if (!current || document.visibilityState !== 'visible') return;
        const pending = adRequest('/event', 'POST', { ticket, kind: 'impression' });
        measurement.current = { ticket, pending };
        pending.catch(() => { measurement.current = null; });
      }, 1100);
    }).catch(() => {});
    return () => { current = false; clearTimeout(timer); measurement.current = null; };
  }, [ad?.id, ad?.revision, ready, visible, foreground, canManage]);
  useEffect(() => {
    if (!ad || !ready || !visible || !foreground || rotationPaused || linkFocused || live.length < 2) return;
    const timer = setTimeout(() => setIndex((value) => value + 1), ad.seconds * 1000);
    return () => clearTimeout(timer);
  }, [ad?.id, ad?.seconds, ready, visible, foreground, rotationPaused, linkFocused, live.length]);
  const click = () => {
    const measured = measurement.current;
    if (!measured || !visible || document.visibilityState !== 'visible') return;
    measured.pending.then(() => adRequest('/event', 'POST', { ticket: measured.ticket, kind: 'click' })).catch(() => {});
  };
  if (!user?.id || (!ad && !canManage)) return null;
  return <aside className="print:hidden mx-4 my-3" aria-label="Advertisement">
    {canManage && <button className="text-sm text-blue-700 underline p-2" onClick={() => setManage(!manage)} aria-expanded={manage}>Manage advertisements</button>}
    {canManage && manage && <AdvertisingManager onChange={reload} />}
    {ad && <div ref={box} className="rounded-xl border border-slate-200 bg-white p-3 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500 mb-2"><span>Advertisement · {ad.advertiser}</span>{live.length > 1 && <button type="button" className="underline p-1" onClick={() => setRotationPaused(!rotationPaused)}>{rotationPaused ? 'Resume rotation' : 'Pause rotation'}</button>}</div>
      <a href={advertisementHref(ad)} target="_blank" rel="noopener noreferrer sponsored" referrerPolicy="no-referrer" onClick={click} onFocus={() => setLinkFocused(true)} onBlur={() => setLinkFocused(false)} className="flex flex-col sm:flex-row gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500">
        {image && <img src={image} alt={ad.headline} onLoad={() => setReady(true)} onError={() => setReady(false)} className="w-full sm:w-48 h-32 object-contain rounded bg-slate-50" />}
        <div className="min-w-0 break-words"><p className="font-semibold text-slate-900">{ad.headline}</p><p className="text-sm text-slate-600 whitespace-pre-wrap">{ad.body}</p><span className="text-sm text-blue-700">Visit advertiser ↗</span></div>
      </a>
    </div>}
  </aside>;
}
