

# Numark NS6 Mapping for Mixxx 🎧

Este projeto visa entregar um mapeamento de nível profissional para a **Numark NS6 (Original)** no **Mixxx**, garantindo estabilidade e alta performance para DJs que utilizam o ecossistema open-source.

> [!WARNING]
> **ESTADO ATUAL: VERSÃO ALPHA (v1.0)**
> O mapeamento está em um estágio avançado, com o motor de áudio e transporte 100% funcionais. O desenvolvimento atual foca no feedback visual de LEDs específicos.

---

## ✅ O que já está funcional (Alpha Stable)

### 🎚️ Mixer e Controle de Áudio (Novo!)

* **Canais e Volumes:** Faders de volume e crossfader com resposta linear.
* **EQ de 3 Bandas:** Controle preciso de frequências (High, Mid, Bass).
* **Filtro Inteligente:** Filtro por canal (High-pass/Low-pass) ativado via **Shift**.
* **Monitoramento PFL (Cue):** Sistema de pré-escuta por canal nos fones de ouvido totalmente funcional.

### 🕹️ Transporte e Precisão

* **High-Res Jogs (14-bits):** Processamento MSB/LSB para scratch e nudge de alta precisão.
* **Smart LED Engine:** Feedback visual para Play, Cue e Sync (com estados de *Blink* e pulso de batida).
* **Jog Ring Animado:** Rotação virtual a 33 1/3 RPM e alerta visual de fim de faixa (*End of Track Warning*).

### 🎼 Pitch, Tom e Tempo

* **Pitch Slide (Fader):** Controle de velocidade de alta resolução.
* **Pitch Bend:** Ajuste temporário de batida via botões dedicados.
* **Keylock & Key Range:** Trava de tom e alternância de escala de pitch.

### 🔁 Motor de Looping Avançado

* **Modo Dual:** Alternância entre AutoLoop (LED Vermelho) e Manual (LED Branco).
* **Instant Trigger:** Botões de 1 a 8 batidas que setam e ativam o loop em um clique.
* **Ferramentas de Loop:** Botões **1/2x**, **2x** e **Loop Shift** funcionais.

### 🚀 Performance e Grid

* **Hotcues (1-5):** Ativação instantânea e exclusão via **Shift** (LED Vermelho).
* **Beatgrid Pro:** Ajuste manual do grid e modo **Slip** (arraste de grid via hardware).
* **Skip (Beatjump):** Lógica de "embreagem" para pulos rápidos de batida via Jogwheel.
* **Busca Tátil (Touch Strip):** Navegação rápida na track (*Needle Drop*).
* **Extras:** Reverse e Censor.

---

## 🛠️ O que ainda está em desenvolvimento (Roadmap)

* **Touch Strip LEDs:** Implementar o feedback visual da posição da agulha na barra de busca.
* **Efeitos (FX):** Mapeamento dos knobs e botões de efeito no topo da unidade.
* **Navegação na Library:** Otimização do encoder central para navegação rápida em listas.

---

## 📥 Como Instalar

1. Baixe os arquivos `.xml` e `.js` deste repositório.
2. Copie-os para a pasta de controladores do seu Mixxx:
* **Linux:** `~/.mixxx/controllers/`
* **Windows:** `%LOCALAPPDATA%\Mixxx\controllers\`


3. Nas preferências do Mixxx, ative o controlador e selecione o mapeamento **"Numark NS6"**.

---

## 🤝 Contribuições

Contribuições são bem-vindas! Sinta-se à vontade para abrir um Pull Request ou relatar bugs nas *Issues*.

**Desenvolvido com ❤️ por:** [@maurojuniorr](https://www.instagram.com/maurojuniorr) | [@omaurodj](https://www.instagram.com/omaurodj)

*Esposo, Pai,Programador, Professor, Pesquisador e DJ.*

