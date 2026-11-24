"""Satır tabanlı MCP stdio sunucusu."""

import json
import sys

from .tools import ARACLAR, calistir

PROTOKOL = "2025-06-18"
KAYNAK = {
    "uri": "takvim://tum",
    "name": "Tüm takvim",
    "description": "Şemadan geçen tüm takvim kayıtları",
    "mimeType": "application/json",
}


class RpcHatasi(Exception):
    def __init__(self, kod, mesaj):
        super().__init__(mesaj)
        self.kod = kod


def _metin_parametresi(parametreler, alan):
    deger = parametreler.get(alan)
    if not isinstance(deger, str) or not deger.strip():
        raise RpcHatasi(-32602, f"Geçersiz parametre ({alan}).")
    return deger


def _yonlendir(metot, parametreler, veri):
    if metot == "initialize":
        surum = (_metin_parametresi(parametreler, "protocolVersion")
                 if "protocolVersion" in parametreler else PROTOKOL)
        return {
            "protocolVersion": surum,
            "capabilities": {"tools": {}, "resources": {}},
            "serverInfo": {"name": "burs-takvimi", "version": "0.1.0"},
        }
    if metot in ("notifications/initialized", "ping"):
        return {}
    if metot == "tools/list":
        return {"tools": ARACLAR}
    if metot == "tools/call":
        ad = _metin_parametresi(parametreler, "name")
        try:
            return calistir(ad, parametreler.get("arguments", {}), veri)
        except ValueError as hata:
            raise RpcHatasi(-32602, str(hata)) from hata
    if metot == "resources/list":
        return {"resources": [KAYNAK]}
    if metot == "resources/read":
        uri = _metin_parametresi(parametreler, "uri")
        if uri != KAYNAK["uri"]:
            raise RpcHatasi(-32002, "Kaynak bulunamadı.")
        return {"contents": [{
            "uri": uri, "mimeType": KAYNAK["mimeType"],
            "text": json.dumps(veri, ensure_ascii=True),
        }]}
    raise RpcHatasi(-32601, "Metot bulunamadı.")


def _hata(kimlik, kod, mesaj):
    return {"jsonrpc": "2.0", "id": kimlik, "error": {"code": kod, "message": mesaj}}


def _gecersiz_sabit(sabit):
    raise ValueError(f"Geçersiz JSON sabiti ({sabit}).")


def satiri_isle(satir, veri):
    try:
        istek = json.loads(satir.decode("utf-8"), parse_constant=_gecersiz_sabit)
    except (ValueError, RecursionError):
        return _hata(None, -32700, "JSON ayrıştırılamadı.")

    if (not isinstance(istek, dict) or istek.get("jsonrpc") != "2.0"
            or not isinstance(istek.get("method"), str)):
        return _hata(None, -32600, "Geçersiz JSON-RPC isteği.")
    bildirim = "id" not in istek
    kimlik = istek.get("id")
    if not bildirim and type(kimlik) not in (str, int):
        return _hata(None, -32600, "İstek id alanı metin veya tam sayı olmalı.")

    try:
        parametreler = istek.get("params", {})
        if not isinstance(parametreler, dict):
            raise RpcHatasi(-32602, "params bir nesne olmalı.")
        sonuc = _yonlendir(istek["method"], parametreler, veri)
        yanit = {"jsonrpc": "2.0", "id": kimlik, "result": sonuc}
    except RpcHatasi as hata:
        yanit = _hata(kimlik, hata.kod, str(hata))
    except Exception as hata:
        print(f"MCP sunucu hatası: {hata!r}", file=sys.stderr)
        yanit = _hata(kimlik, -32603, "Sunucu hatası.")
    return None if bildirim else yanit


def sun(veri):
    for satir in sys.stdin.buffer:
        yanit = satiri_isle(satir, veri)
        if yanit is not None:
            print(json.dumps(yanit, ensure_ascii=True), flush=True)
