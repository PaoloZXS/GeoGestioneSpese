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
            _TipoSegmented(
              isEntrata: _isEntrata,
              onChanged: (v) {
                setState(() => _isEntrata = v);
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
