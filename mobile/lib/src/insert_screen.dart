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
  DateTime _data = DateTime.now();
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
      setState(() {
        _categorie = rows.cast<Map<String, dynamic>>();
        _caricandoCategorie = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _caricandoCategorie = false);
      _messaggio('Errore caricamento categorie: $e', isError: true);
    }
  }

  Future<void> _selezionaData() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _data,
      firstDate: DateTime(2020),
      lastDate: DateTime(2040),
      locale: const Locale('it'),
    );
    if (picked != null) {
      setState(() => _data = picked);
    }
  }

  String _formatData(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  Future<void> _salva() async {
    final importo = double.tryParse(
      _importoController.text.trim().replaceAll(',', '.'),
    );
    if (_categoria == null) {
      _messaggio('Seleziona una categoria');
      return;
    }
    if (importo == null || importo <= 0) {
      _messaggio('Inserisci un importo valido');
      return;
    }

    setState(() => _salvando = true);
    try {
      final dataStr =
          '${_data.year}-${_data.month.toString().padLeft(2, '0')}-${_data.day.toString().padLeft(2, '0')}';
      final id =
          '${_isEntrata ? 'entrata' : 'spesa'}-${DateTime.now().millisecondsSinceEpoch}-${Random().nextInt(0xFFFFFF).toRadixString(36)}';

      if (_isEntrata) {
        await _supabase.from('entrate').insert({
          'id': id,
          'data': dataStr,
          'descrizione': _categoria,
          'importo': importo,
          'origine': 'mobile',
          'visto_da_desktop': false,
        });
      } else {
        await _supabase.from('spese').insert({
          'id': id,
          'data': dataStr,
          'descrizione': _categoria,
          'importo': importo,
          'stato': 'preventivata',
          'origine': 'mobile',
          'visto_da_desktop': false,
        });
      }

      if (!mounted) return;
      setState(() {
        _salvando = false;
        _categoria = null;
        _importoController.clear();
      });
      _messaggio('Salvato!');
    } catch (e) {
      if (!mounted) return;
      setState(() => _salvando = false);
      _messaggio('Errore salvataggio: $e', isError: true);
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
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(
                  value: false,
                  label: Text('Uscita'),
                  icon: Icon(Icons.arrow_downward),
                ),
                ButtonSegment(
                  value: true,
                  label: Text('Entrata'),
                  icon: Icon(Icons.arrow_upward),
                ),
              ],
              selected: {_isEntrata},
              onSelectionChanged: (sel) {
                setState(() => _isEntrata = sel.first);
                _caricaCategorie();
              },
            ),
            const SizedBox(height: 16),

            // ---- DATA ----
            Card(
              margin: EdgeInsets.zero,
              child: ListTile(
                leading: const Icon(Icons.calendar_today),
                title: const Text('Data'),
                subtitle: Text(_formatData(_data)),
                onTap: _selezionaData,
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
