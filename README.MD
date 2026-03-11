 
# Numark NS6 Mapping for Mixxx 🎧

[![Status: Alpha](https://img.shields.io/badge/Status-Alpha-red.svg)](https://github.com/maurojuniorr/numark-ns6-mixxx)
[![Mixxx Version](https://img.shields.io/badge/Mixxx-2.4%2B-blue.svg)](https://mixxx.org)

Este projeto visa preencher uma lacuna para a comunidade: a criação de um mapeamento profissional para a clássica **Numark NS6** no **Mixxx**. Atualmente, não existe um mapeamento oficial completo, e este esforço busca entregar a maior proximidade possível com os padrões industriais de performance.

> [!WARNING]
> **ESTADO ATUAL: VERSÃO ALPHA**
> Este mapeamento é experimental e possui diversos problemas conhecidos. **Não recomendado para uso em apresentações ao vivo.** Em breve, teremos uma versão Beta para uso geral.

---

## ✅ O que já está Perfeito (Alpha Stable)
* **High-Res Jogs (14-bits):** Implementação de precisão cirúrgica com processamento atômico (MSB/LSB) para evitar retrocessos e imprecisões.
* **Nudge de Alta Performance:** Ajuste fino de batida totalmente funcional e calibrado.
* **Smart LED Engine:** Motor de LEDs customizado para Play, Cue e Sync, respeitando estados de *Blink* e sincronia com o *Beat* (via `beat_active`).
* **Transporte Reativo:** Baixa latência nos comandos de Play e Cue.

---

## 🛠️ O que ainda NÃO funciona (Roadmap de Desenvolvimento)
Estamos trabalhando para estabilizar os seguintes pontos:
* **Modo Shift:** Ainda apresenta comportamento instável e não reflete as funções secundárias corretamente.
* **Exclusão de Hotcues:** A lógica de deleção (Shift + Pad) ainda não está operacional.
* **Beatgrid:** Comandos de ajuste de grid via hardware.
* **Efeitos (FX):** Botões e knobs de efeito ainda não mapeados.
* **Looping:** Funções de Loop In, Loop Out e Reloop.
* **Funções Extras:** Reverse, Censor e outros botões secundários.

---

## 🔍 Detalhes de Hardware
* **Diferenciação de Modelo:** Este mapeamento é destinado à **NS6 original**. (A menção a "v2" em versões anteriores referia-se apenas ao versionamento do script de desenvolvimento).
* **Telas:** A NS6 não possui telas integradas, focando toda a performance na reatividade dos controles e LEDs.

---

## 📥 Como Instalar (Para Testadores)
1. Baixe os arquivos `.xml` e `.js` deste repositório.
2. Copie-os para a pasta de controladores do seu Mixxx:
   * **Linux:** `~/.mixxx/controllers/`
   * **macOS:** `/Users/<usuario>/Library/Containers/org.mixxx.mixxx/Data/Library/Application Support/Mixxx/controllers/`
   * **Windows:** `%LOCALAPPDATA%\Mixxx\controllers\`
3. Nas preferências do Mixxx, ative o controlador e selecione o mapeamento "Numark NS6".

---

## 🤝 Contribuições
Contribuições são bem-vindas, especialmente para ajudar no debug do modo Shift e na lógica de deleção dos Hotcues. Sinta-se à vontade para abrir um Pull Request!

**Desenvolvido com ❤️ por:** [@maurojuniorr](https://www.instagram.com/maurojuniorr) | [@omaurodj](https://www.instagram.com/omaurodj)  
*Esposo, Pai, Professor, Pesquisador e DJ.*