// =============================================
// Client Turso — SQL over HTTP (/v2/pipeline)
// =============================================
// Sostituisce il client Supabase: parla direttamente con il database
// Turso tramite POST su {tursoUrl}/v2/pipeline (protocollo Hrana 2).
// Le query usano argomenti posizionali "?" e restituiscono Map.

import 'dart:convert';

import 'package:http/http.dart' as http;

import 'turso_config.dart';

/// Converte un valore Dart nel formato argomenti Turso (Hrana 2).
/// Nota: per i decimali il server Turso vuole `float` con valore numerico (f64),
/// non `real` con stringa.
Map<String, dynamic> _toArg(dynamic v) {
  if (v == null) return {'type': 'null', 'value': null};
  if (v is int) return {'type': 'integer', 'value': v.toString()};
  if (v is double) return {'type': 'float', 'value': v};
  if (v is bool) return {'type': 'integer', 'value': v ? '1' : '0'};
  return {'type': 'text', 'value': v.toString()};
}

/// Estrae il valore di una cella dalla risposta Turso.
dynamic _unwrap(dynamic v) {
  if (v is Map && v.containsKey('type')) {
    if (v['type'] == 'null' || v['value'] == null) return null;
    if (v['type'] == 'integer' || v['type'] == 'float') {
      return num.tryParse(v['value'].toString());
    }
    if (v['type'] == 'blob') return v['base64'] ?? v['value'];
    return v['value'];
  }
  return v;
}

/// Esegue una pipeline Turso con una lista di statement {sql, args}.
Future<Map<String, dynamic>> _pipeline(List<Map<String, dynamic>> stmts) async {
  final requests = <Map<String, dynamic>>[
    for (final s in stmts)
      {
        'type': 'execute',
        'stmt': {
          'sql': s['sql'],
          'args': (s['args'] as List<dynamic>? ?? []).map(_toArg).toList(),
          'named_args': <dynamic>[],
        },
      },
    {'type': 'close'},
  ];

  final resp = await http.post(
    Uri.parse('$tursoUrl/v2/pipeline'),
    headers: {
      'Authorization': 'Bearer $tursoToken',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({'requests': requests}),
  );

  if (resp.statusCode != 200) {
    throw Exception('Turso ${resp.statusCode}: ${resp.body}');
  }
  return jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
}

/// Esegue una SELECT e restituisce una lista di righe come Map.
Future<List<Map<String, dynamic>>> tursoFetchAll(
  String sql, [
  List<dynamic> args = const [],
]) async {
  final data = await _pipeline([
    {'sql': sql, 'args': args},
  ]);
  final results = data['results'] as List<dynamic>? ?? [];
  if (results.isEmpty) return [];
  final first = results.first as Map<String, dynamic>;
  if (first['type'] != 'ok') {
    throw Exception('Turso: risposta non valida');
  }
  final response = first['response'] as Map<String, dynamic>? ?? {};
  final result = response['result'] as Map<String, dynamic>? ?? {};
  // Turso restituisce le colonne come oggetti {"name", "decltype"}.
  // Supporta anche il formato stringa per compatibilità.
  final rawCols = result['cols'] as List<dynamic>? ?? [];
  final cols = rawCols.map((c) {
    if (c is String) return c;
    if (c is Map) return (c['name'] ?? '').toString();
    return c.toString();
  }).toList();
  final rows = result['rows'] as List<dynamic>? ?? [];
  return rows.map((row) {
    final list = row as List<dynamic>;
    final map = <String, dynamic>{};
    for (var i = 0; i < cols.length; i++) {
      map[cols[i]] = _unwrap(list[i]);
    }
    return map;
  }).toList();
}

/// Esegue un'istruzione senza risultato (INSERT/UPDATE/DELETE/DDL).
Future<void> tursoExecute(
  String sql, [
  List<dynamic> args = const [],
]) async {
  await _pipeline([
    {'sql': sql, 'args': args},
  ]);
}
