# Numark NS6 Mapping for Mixxx 🎧

Este projeto visa entregar um mapeamento de nível profissional para a **Numark NS6** no **Mixxx**, garantindo estabilidade e alta performance (Padrão Club) para DJs que utilizam o ecossistema open-source.

> [!WARNING] > **ESTADO ATUAL: VERSÃO BETA (v1.0)**
> O mapeamento está altamente funcional. O motor de áudio, transporte, física dos pratos e sistema de LEDs complexos (FX, Loops e Navegação) estão operantes. Os testes em ambiente de performance ao vivo são por sua conta e risco!

---

## 🔥 O Poder do Botão SHIFT (Funções Ocultas)

O mapeamento foi desenhado para dobrar as capacidades da controladora sem poluir o painel. Segure o botão **SHIFT** de um deck e pressione os botões abaixo para acessar a segunda camada do Mixxx:

| Pressione SHIFT +        | O que acontece no Mixxx                                                         |
| ------------------------ | ------------------------------------------------------------------------------- |
| **Knob de GAIN**         | Transforma o Ganho no botão de **Filtro** (Low-pass / High-pass).               |
| **SYNC**                 | Liga / Desliga o modo **Quantize** (Crava suas ações na batida).                |
| **CUE**                  | Ativa / Desativa o modo **Intro Start**.                                        |
| **LOAD**                 | **Ejeta** a música carregada do deck.                                           |
| **REVERSE**              | **Censor / Reverse Roll** (Toca invertido, mas pula pro tempo certo ao soltar). |
| **KEYLOCK**              | **Sync Key** (Sincroniza o tom da música harmonicamente com o outro deck).      |
| **PITCH BEND (+ / -)**   | Empurra ou freia a batida de forma muito mais **fina e suave**.                 |
| **HOTCUES (1 a 5)**      | **Deleta** o Ponto de Cue correspondente.                                       |
| **Encoder (Pressionar)** | Liga / Desliga o **AutoDJ**.                                                    |
| **VIEW**                 | Alterna a visualização das **Waveforms** na tela.                               |
| **FX ON/OFF**            | Liga / Desliga o **Efeito 2** do Rack (sem o Shift, controla o Efeito 1).       |

---

## ✅ O que já está funcional (Beta 1.0)

### 🎚️ Mixer e Controle de Áudio

-   **Canais e Volumes:** Faders de volume e crossfader com resposta linear, incluindo suporte a **Fader Start** (via botões laterais do crossfader). _Nota: Os VU Meters da NS6 operam de forma nativa via hardware._
-   **EQ de 3 Bandas e Filtro:** Controle preciso de frequências. O Knob de Gain controla o volume e o Filtro Rápido (via _Shift_).
-   **Monitoramento PFL (Cue):** Sistema de pré-escuta por canal nos fones de ouvido totalmente funcional.

### 🕹️ Transporte e Física dos Pratos (Jogwheels)

-   **High-Res Jogs (14-bits):** Processamento MSB/LSB de altíssima precisão.
-   **Física Híbrida (Vinil vs CDJ):**
-   _Modo Scratch:_ Resposta agressiva, sem _delay_ ou efeito elástico (_Zero Momentum_).
-   _Modo CDJ (Pausado):_ Ao girar o prato com a música pausada, o motor engata uma engrenagem pesada (Multiplicador 10x) para _Frame Search_ e _Scrubbing_ de áudio milimétrico, idêntico aos CDJs da Pioneer.

-   **Smart LED Engine:** Animação de boot personalizada e feedback visual de estados de Play/Cue (_Blink_ e pulso).
-   **Jog Ring Animado:** Rotação virtual do anel de LEDs a 33 1/3 RPM e alerta visual de fim de faixa (_Track End Warning_) exato.

### 🎼 Pitch, Tom e Tempo

-   **Pitch Slide (Fader):** Controle de velocidade de alta resolução e **Pitch Range** alternável.
-   **BPM Meter Absoluto:** A régua de LEDs central calcula e exibe visualmente a diferença matemática de BPM entre os canais 1 e 2, facilitando o Beatmatch de olho.
-   **Harmonic Sync & Keylock:** Sincronização avançada de tom.

### 🔁 Motor de Looping Avançado

-   **Modo Dual:** Alternância via botão físico entre AutoLoop (LEDs de tamanho) e Manual (In/Out clássicos).
-   **Instant Trigger:** Botões de 1 a 8 batidas que setam e ativam o loop em um clique.
-   **Ferramentas de Loop:** Botões **1/2x**, **2x** e **Loop Shift** (< e >) funcionais.

### 🚀 Performance, Efeitos e Biblioteca

-   **Busca Tátil (Touch Strip):** Navegação rápida na track (_Needle Drop_) com **LEDs de posição** acompanhando o tempo da música.
-   **Navegação de Library & AutoDJ:** Encoder central otimizado. Botão **Load Prepare** adiciona a música diretamente ao final da fila do **AutoDJ**.
-   **Gestão de Tela (Views e Skins):** Botões **Crates**, **Prepare** e **Files** abrem e fecham dinamicamente as janelas de **Efeitos**, **Mixer** e **Samplers** na interface.
-   **Módulo de FX Completo:** Roteamento e controle do knob principal (Mix) para os Effect Racks 1 e 2.
-   **Beatgrid Pro & Skip:** Ajuste manual do grid, modo **Slip** e botões de pulo de batida (_Beatjump_).

---

## 🛠️ O que falta mapear (Aguardando sugestões da comunidade!)

O mapeamento base e a física estão cravados. Para as próximas atualizações, estamos buscando ideias criativas para aprimorar os seguintes botões:

-   🔘 **Click do FX Select (Pressionar o Encoder de Efeito):** O giro seleciona/ajusta o efeito, mas o _clique_ (Push) deste botão ainda aguarda uma funcionalidade matadora.
-   📂 **Botões Crates, Prepare e Files:** Devido a limitações nativas na arquitetura da biblioteca do Mixxx (não há um comando MIDI direto para pular o cursor de navegação exclusivamente para as abas Crates, AutoDJ ou Arquivos), nós adaptamos esses botões de forma criativa: atualmente eles abrem e fecham as janelas de **Efeitos, Mixer e Samplers** na tela. Ainda assim, estamos abertos a ideias melhores ou algum "hack" de código que torne o uso deles (ou com _Shift_) ainda mais útil para a performance.

💡 **Tem uma ideia boa ou sabe como contornar as limitações da barra lateral?** Abra uma _Issue_ no repositório ou mande um Pull Request!

---

## 📥 Como Instalar

1. Baixe os arquivos `.xml` e `.js` deste repositório.
2. Copie-os para a pasta de controladores do seu Mixxx:

-   **Linux:** `~/.mixxx/controllers/`
-   **Windows:** `%LOCALAPPDATA%\Mixxx\controllers\`
-   **macOS:** `~/Library/Application Support/Mixxx/controllers/`

3. Nas preferências do Mixxx, ative o controlador e selecione o mapeamento **"Numark NS6"**.

---

## 🤝 Contribuições

Contribuições são muito bem-vindas! Sinta-se à vontade para abrir um Pull Request ou relatar bugs nas _Issues_.

**Desenvolvido com ❤️ por:** [@maurojuniorr](https://www.instagram.com/maurojuniorr) | [@omaurodj](https://www.instagram.com/omaurodj) e Gemini (IA)

_Esposo, Pai, Programador, Professor, Pesquisador e DJ._
