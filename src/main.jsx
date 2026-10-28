import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  ArrowLeft, Plus, Search, ScanLine, ImagePlus, Pencil, Trash2, Check,
  X, Upload, Copy, CreditCard, RefreshCw, AlertCircle, Store, Camera, Wifi
} from "lucide-react";
import "./style.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const STARTER_STORES = [
  "5 Элемент", "Белоруснефть", "Санта", "Евроопт", "Prostore-ВПРОК",
  "goodshop", "Соседи-Купилка", "Спортмастер", "Три цены", "FIX Price",
  "Алеся", "Доброnom", "Планета здоровья", "Электросила"
];

const COLORS = ["#303030", "#123d67", "#6b2532", "#254b39", "#5a3a70", "#8b5c17"];
const emptyForm = { store_name: "", card_name: "", card_number: "", barcode_format: "", barcode_image: "", store_image: "" };

function normalizeSharedCard(row) {
  const d = row?.card_data && typeof row.card_data === "object" ? row.card_data : {};
  const store = d.store_name || d.storeName || d.store || d.merchant || d.brand || d.title || "Магазин";
  return {
    id: row.id,
    store_name: store,
    card_name: d.card_name || d.cardName || d.name || d.title || store,
    card_number: d.card_number || d.cardNumber || d.number || d.code || "",
    barcode_format: d.barcode_format || d.barcodeFormat || d.format || "",
    barcode_image: d.barcode_image || d.barcodeImage || "",
    store_image: d.store_image || d.storeImage || d.logo || d.image || "",
    created_at: row.created_at || row.updated_at
  };
}

function App() {
  const [cards, setCards] = useState([]);
  const [stores, setStores] = useState(STARTER_STORES.map(name => ({ name, image: "" })));
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(null);
  const [localOnly, setLocalOnly] = useState(!supabase);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);
  const fileRef = useRef(null);
  const storeFileRef = useRef(null);

  useEffect(() => {
    if (!supabase) {
      try { setCards(JSON.parse(localStorage.getItem("wallet-cards-demo") || "[]")); } catch {}
      return;
    }
    let active = true;
    const load = async () => {
      const [cardsResult, storesResult] = await Promise.all([
        supabase.from("loyalty_cards").select("*").order("updated_at", { ascending: false }),
        supabase.from("loyalty_stores").select("*").order("name", { ascending: true })
      ]);
      if (cardsResult.error) {
        if (active) setNotice("Не удалось загрузить карты из Supabase: " + cardsResult.error.message);
        return;
      }
      if (active) {
        setCards(cardsResult.data || []);
        const storeRows = storesResult.data || [];
        setStores(storeRows.length
          ? storeRows.map(store => ({ name: store.name, image: store.image || "" }))
          : STARTER_STORES.map(name => ({ name, image: "" })));
      }
    };
    load();
    const channel = supabase.channel("wallet-live-cards")
      .on("postgres_changes", { event: "*", schema: "public", table: "loyalty_cards" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "loyalty_stores" }, load)
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!supabase) localStorage.setItem("wallet-cards-demo", JSON.stringify(cards));
  }, [cards]);

  useEffect(() => {
    if (!scannerOpen) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    setScanError("");
    reader.decodeFromVideoDevice(undefined, videoRef.current, (result, error, controls) => {
      if (cancelled) return;
      if (controls) controlsRef.current = controls;
      if (result) {
        const text = result.getText();
        setForm(f => ({ ...f, card_number: text, barcode_format: String(result.getBarcodeFormat()) }));
        setNotice("Штрихкод считан");
        stopScanner();
      }
    }).catch(() => setScanError("Не удалось открыть камеру. Разреши доступ к камере и проверь, что сайт открыт по HTTPS."));
    return () => { cancelled = true; controlsRef.current?.stop(); };
  }, [scannerOpen]);

  function stopScanner() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScannerOpen(false);
  }

  function openAdd() {
    setEditing(null); setSelected(null); setForm(emptyForm); setModal(true); setNotice("");
  }

  function openEdit(card) {
    setEditing(card); setSelected(null);
    setForm({
      store_name: card.store_name || "",
      card_name: card.card_name || "",
      card_number: card.card_number || "",
      barcode_format: card.barcode_format || "",
      barcode_image: card.barcode_image || "",
      store_image: card.store_image || ""
    });
    setModal(true); setNotice("");
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleCardImage(file) {
    if (!file) return;
    const data = await fileToDataUrl(file);
    setForm(f => ({ ...f, barcode_image: data }));
    // Best-effort barcode reading from an image selected from the gallery.
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(data);
      if (result?.getText()) {
        setForm(f => ({ ...f, barcode_image: data, card_number: result.getText(), barcode_format: String(result.getBarcodeFormat()) }));
        setNotice("Штрихкод найден на изображении");
      }
    } catch {
      setNotice("Изображение добавлено. Если номер не считался автоматически, введи его вручную.");
    }
  }

  async function saveCard(e) {
    e.preventDefault();
    if (!form.store_name.trim()) { setNotice("Выбери магазин или введи название."); return; }
    setBusy(true);
    const payload = {
      store_name: form.store_name.trim(),
      card_name: form.card_name.trim() || form.store_name.trim(),
      card_number: form.card_number.trim(),
      barcode_format: form.barcode_format,
      barcode_image: form.barcode_image,
      store_image: form.store_image
    };
    if (supabase) {
      const row = { ...payload, updated_at: new Date().toISOString() };
      const result = editing
        ? await supabase.from("loyalty_cards").update(row).eq("id", editing.id)
        : await supabase.from("loyalty_cards").insert(row);
      if (result.error) setNotice("Ошибка сохранения: " + result.error.message);
      else { setNotice("Карта сохранена и синхронизируется у всех пользователей."); setModal(false); }
    } else {
      setCards(prev => editing ? prev.map(c => c.id === editing.id ? { ...c, ...payload } : c) : [{ id: crypto.randomUUID(), ...payload, created_at: new Date().toISOString() }, ...prev]);
      setModal(false);
      setNotice("Демо-режим: карта сохранена только в этом браузере. Подключи Supabase для общего доступа.");
    }
    setBusy(false);
  }

  async function deleteCard(card) {
    if (!confirm(`Удалить карту «${card.card_name || card.store_name}» у всех пользователей?`)) return;
    if (supabase) {
      const { error } = await supabase.from("loyalty_cards").delete().eq("id", card.id);
      if (error) setNotice("Не удалось удалить карту: " + error.message);
    } else setCards(prev => prev.filter(c => c.id !== card.id));
    setSelected(null);
  }

  async function saveStoreImage(storeName, file) {
    if (!file) return;
    const image = await fileToDataUrl(file);
    const updated = stores.map(s => s.name === storeName ? { ...s, image } : s);
    setStores(updated);
    if (supabase) {
      const row = { name: storeName, image, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("loyalty_stores").upsert(row, { onConflict: "name" });
      if (error) setNotice("Фото магазина не сохранилось: " + error.message);
      else setNotice("Фото магазина добавлено и доступно всем.");
    } else setNotice("Фото добавлено только в демо-режиме.");
  }

  const filtered = useMemo(() => cards.filter(c => `${c.store_name} ${c.card_name} ${c.card_number}`.toLowerCase().includes(query.toLowerCase())), [cards, query]);
  const storeNames = useMemo(() => [...new Set([...stores.map(s => s.name), ...cards.map(c => c.store_name).filter(Boolean)])].sort((a,b) => a.localeCompare(b, "ru")), [stores, cards]);
  const selectedStore = stores.find(s => s.name === form.store_name);

  function copyNumber(value) {
    navigator.clipboard?.writeText(value).then(() => setNotice("Номер скопирован")).catch(() => setNotice("Не удалось скопировать номер"));
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark"><CreditCard size={21}/></div>
      <div className="brand-copy"><strong>Wallet</strong><span>Карты лояльности</span></div>
      <div className={`sync-pill ${supabase ? "live" : ""}`} title={supabase ? "Общая синхронизация включена" : "Демо-режим"}>
        {supabase ? <Wifi size={15}/> : <RefreshCw size={15}/>}<span>{supabase ? "Онлайн" : "Демо"}</span>
      </div>
      <button className="icon-button add-top" onClick={openAdd} aria-label="Добавить карту"><Plus/></button>
    </header>

    <div className="intro">
      <div><div className="eyebrow">ТВОИ КАРТЫ · В ОДНОМ МЕСТЕ</div><h1>Кошелёк, который<br/><span>всегда с тобой.</span></h1></div>
      <div className="count-bubble">{cards.length}<small>карт</small></div>
    </div>

    {!supabase && <div className="setup-banner"><AlertCircle size={18}/><div><b>Пока включён демо-режим</b><p>Карты сохраняются только в этом браузере. Для общей базы и синхронизации на всех устройствах подключи Supabase — инструкция есть в README.</p></div></div>}
    {notice && <button className="notice" onClick={() => setNotice("")}>{notice}<X size={15}/></button>}

    <div className="search-wrap"><Search size={20}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по картам и магазинам"/>{query && <button onClick={() => setQuery("")}><X size={17}/></button>}</div>

    <section className="section-head"><div><h2>Мои карты</h2><p>Общие для всех устройств</p></div><button className="text-button" onClick={openAdd}><Plus size={17}/> Добавить</button></section>

    {filtered.length ? <div className="cards-grid">{filtered.map((card, index) => <button className="loyalty-card" key={card.id} onClick={() => setSelected(card)}>
      <div className="card-art" style={{ background: card.store_image ? "transparent" : `linear-gradient(135deg, ${COLORS[index % COLORS.length]}, #191919)` }}>
        {card.store_image ? <img src={card.store_image} alt=""/> : <><div className="card-orb orb-a"/><div className="card-orb orb-b"/><div className="card-brand">{card.store_name}</div><div className="card-sub">{card.card_name !== card.store_name ? card.card_name : "КАРТА ЛОЯЛЬНОСТИ"}</div><div className="card-chip"><span/><span/><span/></div></>}
      </div>
      <div className="card-label"><span>{card.card_name || card.store_name}</span><span className="card-arrow">↗</span></div>
      <div className="card-number">{card.card_number || "Номер не указан"}</div>
    </button>)}</div> : <div className="empty-state"><div className="empty-icon"><CreditCard size={28}/></div><h3>{query ? "Ничего не нашлось" : "Кошелёк пока пуст"}</h3><p>{query ? "Попробуй другое название или номер." : "Добавь первую карту — она появится здесь."}</p>{!query && <button className="primary-button" onClick={openAdd}><Plus size={18}/> Добавить первую карту</button>}</div>}

    <section className="section-head stores-head"><div><h2>Магазины</h2><p>Добавь фото карт — свои изображения можно загрузить ниже</p></div></section>
    <div className="stores-grid">{stores.map(store => <div className="store-tile" key={store.name}>
      <button className="store-image" onClick={() => { setForm(f => ({ ...f, store_name: store.name, card_name: store.name, store_image: store.image || "" })); setEditing(null); setModal(true); }} title={`Добавить карту ${store.name}`}>
        {store.image ? <img src={store.image} alt={store.name}/> : <span>{store.name.slice(0, 1).toUpperCase()}</span>}
      </button>
      <div className="store-meta"><b>{store.name}</b><label className="upload-store" title="Загрузить фото карты магазина"><ImagePlus size={15}/><input type="file" accept="image/*" onChange={e => saveStoreImage(store.name, e.target.files?.[0])}/></label></div>
      <button className="store-add" onClick={() => { setEditing(null); setForm({ ...emptyForm, store_name: store.name, card_name: store.name, store_image: store.image || "" }); setModal(true); }}><Plus size={14}/> Добавить карту</button>
    </div>)}</div>

    <footer><div className="footer-logo"><CreditCard size={18}/> WALLET</div><span>Твои скидочные карты. Без лишнего.</span></footer>

    {modal && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setModal(false); }}><form className="modal" onSubmit={saveCard}>
      <div className="modal-head"><div><span className="eyebrow">{editing ? "РЕДАКТИРОВАНИЕ" : "НОВАЯ КАРТА"}</span><h2>{editing ? "Изменить карту" : "Добавить карту"}</h2></div><button type="button" className="icon-button" onClick={() => setModal(false)}><X/></button></div>
      <label className="field-label">Магазин</label>
      <select value={form.store_name} onChange={e => { const s = stores.find(x => x.name === e.target.value); setForm(f => ({ ...f, store_name: e.target.value, card_name: f.card_name || e.target.value, store_image: s?.image || f.store_image })); }} required>
        <option value="">Выбери магазин</option>{storeNames.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      <label className="field-label">Название карты <span>необязательно</span></label>
      <input className="text-input" value={form.card_name} onChange={e => setForm(f => ({...f, card_name: e.target.value}))} placeholder="Например, Семейная карта"/>
      <label className="field-label">Штрихкод или номер карты</label>
      <input className="text-input barcode-input" value={form.card_number} onChange={e => setForm(f => ({...f, card_number: e.target.value}))} placeholder="Отсканируй или введи вручную"/>
      {form.barcode_format && <div className="format-note">Формат распознавания: {form.barcode_format}</div>}
      <div className="action-row">
        <button type="button" className="secondary-button" onClick={() => setScannerOpen(true)}><Camera size={18}/> Камера</button>
        <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}><ImagePlus size={18}/> Из галереи</button>
        <input ref={fileRef} hidden type="file" accept="image/*" onChange={e => handleCardImage(e.target.files?.[0])}/>
      </div>
      {form.barcode_image && <div className="uploaded-preview"><img src={form.barcode_image} alt="Изображение штрихкода"/><button type="button" onClick={() => setForm(f => ({...f, barcode_image: ""}))}><Trash2 size={15}/> Убрать</button></div>}
      <div className="modal-tip"><ScanLine size={17}/><span>Поддерживаются распространённые 1D и 2D штрихкоды. Если автоматическое распознавание не сработало, номер можно ввести вручную.</span></div>
      <button className="primary-button save-button" type="submit" disabled={busy}>{busy ? "Сохраняю…" : <><Check size={18}/> {editing ? "Сохранить изменения" : "Добавить в Wallet"}</>}</button>
      {notice && <p className="modal-notice">{notice}</p>}
    </form></div>}

    {scannerOpen && <div className="overlay scanner-overlay"><div className="scanner-modal">
      <div className="modal-head"><div><span className="eyebrow">СКАНЕР</span><h2>Наведи камеру на код</h2></div><button className="icon-button" onClick={stopScanner}><X/></button></div>
      <div className="video-frame"><video ref={videoRef} muted playsInline/><div className="scan-line"/></div>
      <p className="scanner-help">Держи штрихкод внутри рамки и обеспечь хорошее освещение.</p>
      {scanError && <p className="error-text">{scanError}</p>}
      <button className="secondary-button full-button" onClick={stopScanner}>Закрыть сканер</button>
    </div></div>}

    {selected && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}><div className="detail-modal">
      <div className="detail-top"><button className="icon-button" onClick={() => setSelected(null)}><ArrowLeft/></button><span>КАРТА ЛОЯЛЬНОСТИ</span><button className="icon-button" onClick={() => openEdit(selected)}><Pencil/></button></div>
      <div className="detail-art" style={{ background: selected.store_image ? "transparent" : `linear-gradient(135deg, ${COLORS[cards.findIndex(c => c.id === selected.id) % COLORS.length]}, #171717)` }}>
        {selected.store_image ? <img src={selected.store_image} alt=""/> : <><div className="card-orb orb-a"/><div className="card-orb orb-b"/><div className="card-brand">{selected.store_name}</div><div className="card-sub">КАРТА ЛОЯЛЬНОСТИ</div></>}
      </div>
      <h2>{selected.card_name || selected.store_name}</h2><p className="detail-store">{selected.store_name}</p>
      {selected.barcode_image ? <img className="barcode-image" src={selected.barcode_image} alt="Штрихкод карты"/> : <div className="barcode-visual"><div className="fake-bars"/><span>{selected.card_number || "Номер не указан"}</span></div>}
      <div className="detail-number"><div><small>Номер карты</small><b>{selected.card_number || "Не указан"}</b></div>{selected.card_number && <button className="icon-button" onClick={() => copyNumber(selected.card_number)}><Copy/></button>}</div>
      <div className="detail-actions"><button className="secondary-button" onClick={() => openEdit(selected)}><Pencil size={17}/> Изменить</button><button className="danger-button" onClick={() => deleteCard(selected)}><Trash2 size={17}/> Удалить</button></div>
      {supabase && <p className="shared-note"><Wifi size={15}/> Изменения синхронизируются у всех пользователей</p>}
    </div></div>}
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
