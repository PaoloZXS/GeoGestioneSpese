import 'dart:math';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'login_screen.dart';

class InsertScreen extends StatefulWidget {
  const InsertScreen({super.key});

  @override
  State<InsertScreen> createState() => _InsertScreenState();
}

class _InsertScreenState extends State<InsertScreen> {
  final _supabase = Supabase.instance.client;
  final _importoController = TextEditingController();

  bool _isEntrata = false; // false = uscita
  String _dataInizio =
      '${DateTime.now().year}-${DateTime.now().month.toString().padLeft(2, '0')}';
  String _dataFine = '${DateTime.now().year}-12';
  String? _categoria;
  List<Map<String, dynamic>> _categorie = [];
  bool _caricandoCategorie = true;
  bool _salvando = false;

  @override
  void initState() {
    super.initState();
    _caricaCategorie();
  }

  @override
  void dispose() {
    _importoController.dispose();
    super.dispose();
  }

  Future<void> _caricaCategorie() async {
    setState(() {
      _caricandoCategorie = true;
      _categoria = null;
    });
    try {
      final tipo = _isEntrata ? 'entrate' : 'uscite';
      final rows = await _supabase
          .from('categorie')
          .select('descrizione')
          .eq('tipo', tipo)
          .order('descrizione');
      if (!mounted) return;
      // Ordine alfabetico garantito (indipendente dalla collation del DB)
      final lista = rows.cast<Map<String, dynamic>>();
      lista.sort(
        (a, b) => (a['descrizione'] as String).toLowerCase().compareTo(
          (b['descrizione'] as String).toLowerCase(),
        ),
      );
      setState(() {
        _categorie = lista;
        _caricandoCategorie = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _caricandoCategorie = false);
      _messaggio('Errore caricamento categorie: $e', isError: true);
    }
  }

  static const _nomiMesi = [
    'Gennaio',
    'Febbraio',
    'Marzo',
    'Aprile',
    'Maggio',
    'Giugno',
    'Luglio',
    'Agosto',
    'Settembre',
    'Ottobre',
    'Novembre',
    'Dicembre',
  ];

  String _formatMese(String ym) {
    final p = ym.split('-');
    return '${_nomiMesi[int.parse(p[1]) - 1]} ${p[0]}';
  }

  /// Selettore mese/anno che restituisce una stringa YYYY-MM.
  Future<void> _selezionaMese({required bool isInizio}) async {
    final corrente = isInizio ? _dataInizio : _dataFine;
    final p = corrente.split('-');
    var anno = int.parse(p[0]);
    var mese = int.parse(p[1]);
    final now = DateTime.now();

    final scelto = await showDialog<Map<String, int>>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(isInizio ? 'Data inizio' : 'Data fine'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButton<int>(
                value: anno,
                isExpanded: true,
                items: [
                  for (var a = now.year; a <= now.year + 5; a++)
                    DropdownMenuItem(value: a, child: Text('$a')),
                ],
                onChanged: (v) => setDialogState(() => anno = v ?? anno),
              ),
              const SizedBox(height: 12),
              DropdownButton<int>(
                value: mese,
                isExpanded: true,
                items: [
                  for (var m = 1; m <= 12; m++)
                    DropdownMenuItem(value: m, child: Text(_nomiMesi[m - 1])),
                ],
                onChanged: (v) => setDialogState(() => mese = v ?? mese),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Annulla'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, {'anno': anno, 'mese': mese}),
              child: const Text('OK'),
            ),
          ],
        ),
      ),
    );

    if (scelto == null || !mounted) return;
    final ym =
        '${scelto['anno']}-${scelto['mese']!.toString().padLeft(2, '0')}';
    setState(() {
      if (isInizio) {
        _dataInizio = ym;
      } else {
        _dataFine = ym;
      }
    });
  }

  /// Calcola il giorno valido per il mese (scala all'ultimo giorno se eccede).
  String _calcolaDataFineMese(int year, int month, int giorno) {
    final lastDay = DateTime(year, month + 1, 0).day;
    final day = giorno > lastDay ? lastDay : giorno;
    return '${year.toString().padLeft(4, '0')}-'
        '${month.toString().padLeft(2, '0')}-'
        '${day.toString().padLeft(2, '0')}';
  }

  Future<void> _salva() async {
    final importo = double.tryParse(
      _importoController.text.trim().replaceAll(',', '.'),
    );
    final categoria = _categoria;
    if (categoria == null) {
      _messaggio('Seleziona una categoria');
      return;
    }
    if (importo == null || importo <= 0) {
      _messaggio('Inserisci un importo valido');
      return;
    }
    if (_dataFine.compareTo(_dataInizio) < 0) {
      _messaggio(
        'La data fine non può precedere la data inizio',
        isError: true,
      );
      return;
    }

    setState(() => _salvando = true);
    try {
      final tipo = _isEntrata ? 'entrate' : 'uscite';
      final id =
          'ric-${_isEntrata ? 'e' : 'u'}-'
          '${DateTime.now().millisecondsSinceEpoch}-'
          '${Random().nextInt(0xFFFFFF).toRadixString(36)}';

      // Salva la voce ricorrente su Supabase
      await _supabase.from('ricorrenti').insert({
        'id': id,
        'tipo': tipo,
        'descrizione': categoria,
        'importo': importo,
        'giorno': 1,
        'data_inizio': _dataInizio,
        'data_fine': _dataFine,
      });

      // Applica i ricorrenti all'anno corrente (genera spese/entrate)
      await _applicaRicorrenti(
        ricId: id,
        tipo: tipo,
        descrizione: categoria,
        importo: importo,
        dataInizio: _dataInizio,
        dataFine: _dataFine,
      );

      if (!mounted) return;
      setState(() {
        _salvando = false;
        _categoria = null;
        _importoController.clear();
      });
      _messaggio('Ricorrente salvato!');
    } catch (e) {
      if (!mounted) return;
      setState(() => _salvando = false);
      _messaggio('Errore salvataggio: $e', isError: true);
    }
  }

  /// Applica la voce ricorrente all'anno corrente, generando le relative
  /// spese/entrate mensili (equivalente mobile di applicaRicorrenti del web).
  Future<void> _applicaRicorrenti({
    required String ricId,
    required String tipo,
    required String descrizione,
    required double importo,
    required String dataInizio,
    required String dataFine,
  }) async {
    final year = DateTime.now().year;
    final inizio = DateTime.parse('$dataInizio-01');
    final fine = DateTime.parse('$dataFine-01');
    final firstMonth = inizio.year == year ? inizio.month : 1;
    final lastMonth = fine.year == year ? fine.month : 12;

    for (var m = firstMonth; m <= lastMonth; m++) {
      final meseDate = DateTime(year, m, 1);
      if (meseDate.isBefore(inizio) || meseDate.isAfter(fine)) continue;

      final dataStr = _calcolaDataFineMese(year, m, 1);
      final id =
          '${tipo == 'uscite' ? 'spesa' : 'entrata'}-'
          '${DateTime.now().millisecondsSinceEpoch}-'
          '${Random().nextInt(0xFFFFFF).toRadixString(36)}';

      if (tipo == 'uscite') {
        await _supabase.from('spese').insert({
          'id': id,
          'data': dataStr,
          'descrizione': descrizione,
          'importo': importo,
          'stato': 'preventivata',
          'ric_id': ricId,
          'origine': 'mobile',
          'visto_da_desktop': false,
        });
      } else {
        await _supabase.from('entrate').insert({
          'id': id,
          'data': dataStr,
          'descrizione': descrizione,
          'importo': importo,
          'stato': 'preventivata',
          'ric_id': ricId,
          'origine': 'mobile',
          'visto_da_desktop': false,
        });
      }
    }
  }

  void _messaggio(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: isError
              ? Colors.red.shade700
              : Colors.green.shade700,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Nuovo inserimento'),
        actions: [
          IconButton(
            tooltip: 'Esci',
            icon: const Icon(Icons.logout),
            onPressed: () => Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => const LoginScreen()),
            ),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          children: [
            // ---- TIPO (entrata / uscita) ----
            _TipoSegmented(
              isEntrata: _isEntrata,
              onChanged: (v) {
                setState(() => _isEntrata = v);
                _caricaCategorie();
              },
            ),
            const SizedBox(height: 16),

            // ---- DATA INIZIO / FINE (YYYY-MM) ----
            Card(
              margin: EdgeInsets.zero,
              child: ListTile(
                leading: const Icon(Icons.play_circle_outline),
                title: const Text('Data inizio'),
                subtitle: Text(_formatMese(_dataInizio)),
                onTap: () => _selezionaMese(isInizio: true),
              ),
            ),
            const SizedBox(height: 8),
            Card(
              margin: EdgeInsets.zero,
              child: ListTile(
                leading: const Icon(Icons.event),
                title: const Text('Data fine'),
                subtitle: Text(_formatMese(_dataFine)),
                onTap: () => _selezionaMese(isInizio: false),
              ),
            ),
            const SizedBox(height: 16),

            // ---- CATEGORIA (select in base al tipo) ----
            DropdownButtonFormField<String>(
              value: _categoria,
              decoration: const InputDecoration(
                labelText: 'Categoria',
                prefixIcon: Icon(Icons.category),
              ),
              items: _caricandoCategorie
                  ? null
                  : _categorie
                        .map(
                          (c) => DropdownMenuItem(
                            value: c['descrizione'] as String,
                            child: Text(c['descrizione'] as String),
                          ),
                        )
                        .toList(),
              onChanged: _salvando
                  ? null
                  : (v) => setState(() => _categoria = v),
            ),
            const SizedBox(height: 16),

            // ---- IMPORTO ----
            TextField(
              controller: _importoController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Importo (€)',
                prefixIcon: Icon(Icons.euro),
              ),
            ),
            const SizedBox(height: 24),

            // ---- SALVA ----
            FilledButton.icon(
              onPressed: _salvando ? null : _salva,
              icon: _salvando
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save),
              label: const Text('Salva'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Selettore Tipo (Uscita = rosso, Entrata = verde).
class _TipoSegmented extends StatelessWidget {
  const _TipoSegmented({required this.isEntrata, required this.onChanged});

  final bool isEntrata;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.all(4),
      child: Row(
        children: [
          Expanded(child: _buildButton(false)),
          const SizedBox(width: 4),
          Expanded(child: _buildButton(true)),
        ],
      ),
    );
  }

  Widget _buildButton(bool entrata) {
    final selected = isEntrata == entrata;
    final color = entrata ? Colors.green.shade600 : Colors.red.shade600;
    return Material(
      color: selected ? color : Colors.transparent,
      borderRadius: BorderRadius.circular(9),
      child: InkWell(
        borderRadius: BorderRadius.circular(9),
        onTap: () => onChanged(entrata),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                entrata ? Icons.arrow_upward : Icons.arrow_downward,
                size: 18,
                color: selected ? Colors.white : color,
              ),
              const SizedBox(width: 6),
              Text(
                entrata ? 'Entrata' : 'Uscita',
                style: TextStyle(
                  color: selected ? Colors.white : color,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
