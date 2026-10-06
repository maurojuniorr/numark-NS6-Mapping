# Mapeamento Numark NS6 para Mixxx

Este repositório contém um mapeamento independente da controladora original Numark NS6 de quatro canais para o Mixxx. O projeto é baseado no protocolo MIDI da NS6 e em testes com o hardware; ele não faz parte do driver de áudio para macOS nem do driver Linux.

O mapeamento segue em desenvolvimento ativo. Foi usado com o Mixxx no macOS e validado com capturas MIDI e testes automatizados, mas o comportamento pode variar conforme a versão do Mixxx e o firmware. Teste as mudanças antes de usá-las em um set ao vivo e relate problemas reproduzíveis nas Issues do GitHub.

## Funcionalidades atuais

### Decks e mixer

- Seleção de camadas para os quatro decks; os LEDs de layer acompanham os decks selecionados.
- Play, pause, Cue, hotcues, sync, reverse, loops, beatjump, keylock e carregamento de faixas.
- PFL exclusivo: ao selecionar um deck, o PFL dos demais é desligado. Os LEDs de PFL são controlados pelo mixer físico da NS6.
- Faders de volume dos canais usam os valores MIDI de 14 bits (MSB/LSB), com tratamento das extremidades para chegar ao mínimo e ao máximo sem retorno indevido.
- O crossfader físico permanece como controle separado de 14 bits. O knob **X-Fader** da NS6 ajusta a curva do crossfader no Mixxx.
- Knobs de volume Master, volume dos fones e CUE/MIX dos fones são mapeados separadamente. CUE/MIX usa o par CC de 14 bits.

### Jog wheels e pitch

- Leitura de posição dos jogs em 14 bits nos quatro decks, com scratch, busca de faixa com a música pausada e handoff de volta à reprodução.
- Um giro rápido para trás pode continuar como backspin; solturas normais de scratch retornam à reprodução sem enviar um toggle de Play. Scratch em deck pausado mantém a faixa pausada.
- O tempo de início do Play pode ser configurado nas opções do controlador no Mixxx. Zero mantém o início instantâneo.
- Os ranges de pitch alternam entre ±8%, ±16% e ±50%. O mapeamento inclui LEDs de centro do pitch e orientação para beatmatch.

### Biblioteca e LEDs

- **Crates** coloca o foco na árvore lateral da biblioteca; **Files** coloca o foco no campo de busca. Os LEDs acompanham o painel focado, e os botões preservam o modo visual atual, tanto no layout normal quanto na Big Library.
- **Prepare** alterna a Big Library. Seu LED acompanha esse modo e permanece aceso ao alternar entre Crates e Files dentro da Big Library.
- **View** alterna entre layouts de dois e quatro decks.
- O encoder central navega pela biblioteca; pressioná-lo expande ou recolhe o item lateral selecionado. O controle Load Prepare adiciona a faixa selecionada ao Auto DJ.
- Há retorno por LEDs para jog rings, touch strips, transporte, loops, efeitos e indicadores do mixer, conforme suportado pela NS6.

## Tabela de controles

Os controles de deck abaixo se repetem nos quatro decks. Os botões **SHIFT** e **LOAD** são locais a cada deck; quando SHIFT está pressionado, algumas funções mudam conforme indicado. A posição física esquerda seleciona os decks 1/3 e a direita seleciona os decks 2/4.

### Navegação e biblioteca

| Controle | Ação no mapeamento |
| --- | --- |
| **VIEW** | Alterna entre a visualização de 2 e 4 decks. |
| **PREPARE** | Alterna a Big Library. O LED acompanha esse modo e continua aceso ao alternar entre Crates e Files dentro dele. |
| **CRATES** | Coloca o foco na árvore lateral da biblioteca. Não força a Big Library. |
| **FILES** | Coloca o foco no campo/painel de busca de arquivos. Não força a Big Library. |
| **BACK** | Move o foco de navegação para trás; com SHIFT, usa `MoveFocusBackward`. |
| **FWD** | Move o foco de navegação para frente. |
| **Encoder da biblioteca — girar** | Move a seleção vertical da biblioteca. |
| **Encoder da biblioteca — pressionar** | Expande ou recolhe o item selecionado na árvore lateral. |
| **SHIFT + pressionar encoder** | Liga ou desliga o Auto DJ. |
| **LOAD PREPARE** | Adiciona a faixa selecionada ao final da lista do Auto DJ. |

### Transporte, jog e pitch — por deck

| Controle | Ação no mapeamento |
| --- | --- |
| **PLAY** | Alterna reprodução/pausa; o script corrige eventos de soltura MIDI ausentes ou malformados. |
| **CUE** | Usa o comportamento CUE nativo do Mixxx, com retorno ao ponto e reprodução de prévia enquanto pressionado, conforme o estado do cue. |
| **HOT CUE 1–5** | Aciona o hotcue correspondente; **SHIFT + HOT CUE** apaga esse hotcue. Os LEDs indicam hotcues existentes. |
| **SYNC** | Alterna Sync; **SHIFT + SYNC** alterna Quantize. |
| **MASTER TEMPO / KEYLOCK** | Alterna Keylock; **SHIFT + botão** aciona Sync Key. |
| **PITCH BEND − / +** | Faz pitch bend temporário para baixo/cima; com SHIFT usa os passos menores. |
| **PITCH RANGE** | Percorre os ranges ±8%, ±16% e ±50%. |
| **Pitch fader** | Controla a taxa de reprodução (`rate`) com leitura MIDI de 14 bits. O LED central indica pitch em zero; as setas orientam o ajuste de BPM entre os decks ativos. |
| **JOG — borda** | Ajusta a posição/bend conforme reprodução e modo; no modo scratch, o script processa toque, movimento, soltura, handoff e backspin. |
| **JOG — toque no topo** | Inicia o scratch enquanto tocado; soltura retoma a reprodução somente se o deck estava tocando antes do scratch. |
| **SCRATCH** | Alterna o modo scratch do jog. |
| **STRIP SEARCH** | Salta para a posição indicada pela touch strip. |
| **REVERSE** | Alterna reverse; **SHIFT + segurar** ativa Reverse Roll enquanto pressionado. |
| **TAP** | Registra um toque de BPM no deck. |
| **LOAD** | Carrega a faixa selecionada no deck; **SHIFT + LOAD** ejeta a faixa. |
| **PFL / CUE do canal** | O Note On liga o PFL do canal e desliga os outros três; o Note Off desliga esse PFL. Todos podem ficar desligados. O LED é controlado pelo mixer físico. |
| **Atribuição do crossfader — esquerda/direita** | Direciona o deck para o lado esquerdo ou direito do crossfader; ao soltar, retorna a atribuição ao centro. |

### Loops, beatgrid e beatjump — por deck

| Controle | Ação no mapeamento |
| --- | --- |
| **LOOP MODE** | Alterna entre loop automático e manual e limpa o loop atual. |
| **LOOP ON/OFF** | Ativa um beatloop se não houver loop; se já houver loop, alterna o reloop. |
| **1/2× / 2×** | Reduz pela metade ou dobra o tamanho do loop. |
| **AUTO LOOP 1 / 2 / 4 / 8** | No modo automático, cria ou desativa o beatloop do tamanho indicado. |
| **Modo manual: botão 1** | Define o ponto Loop In; com loop ativo, retorna ao início do loop. |
| **Modo manual: botão 2** | Define Loop Out e ativa o loop quando já existe um ponto In; com loop ativo, salta ao fim do loop. |
| **Modo manual: botão 3** | Aciona Sync Key. |
| **Modo manual: botão 4** | Sai do reloop. |
| **SKIP (segurar) + girar o jog** | Faz beatjump em passos de um beat na direção do giro. |
| **CLEAR/SET** | Move o marcador do beatgrid para a posição atual; **SHIFT + CLEAR/SET** apaga o marcador mais próximo. |
| **ADJUST/SLIP + jog** | Ajusta temporariamente o beatgrid; **SHIFT + ADJUST/SLIP + jog** ajusta/estica o grid. |
| **Botão LOOP SHIFT esquerdo/direito** | Faz beatjump de −1/+1 beat. Apesar do nome físico, o mapeamento atual não desloca o loop inteiro. |

### Mixer

| Controle | Ação no mapeamento |
| --- | --- |
| **Channel fader 1–4** | Controla o volume dos canais em 14 bits, com tratamento dos extremos. |
| **GAIN** | Controla o ganho/pré-ganho do canal; **SHIFT + GAIN** controla o Quick Effect do deck. |
| **EQ HIGH / MID / LOW** | Controla as três bandas de equalização do canal. |
| **Channel input 1–4** | Alterna mute do canal correspondente no Mixxx. |
| **Crossfader físico** | Controla a posição do crossfader do Mixxx em 14 bits. |
| **X-FADER** | Ajusta a curva do crossfader; é separado do crossfader físico. |
| **Botão de contorno do crossfader** | Alterna entre a curva de scratch e o perfil de curva salvo. |
| **MASTER** | Controla o ganho Master do Mixxx. |
| **Headphone LEVEL** | Controla o volume de pré-escuta. |
| **CUE/MIX** | Controla a mistura entre cue e master nos fones em 14 bits. |
| **Fader Start esquerdo/direito** | Habilita o início/retorno ao cue quando o crossfader cruza o extremo correspondente. |
| **Layer esquerdo** | Alterna os decks 1 e 3 na camada esquerda. |
| **Layer direito** | Alterna os decks 2 e 4 na camada direita. |

### Efeitos

| Controle | Ação no mapeamento |
| --- | --- |
| **FX ON/OFF esquerdo/direito** | Liga/desliga o efeito selecionado na unidade FX 1/2; SHIFT nos decks daquele lado seleciona o segundo efeito. |
| **FX MIX esquerdo/direito** | Controla o wet/dry da unidade FX correspondente. |
| **FX PARAM** | Ajusta o parâmetro do efeito selecionado em passos de 0,05. |
| **FX SELECT — girar** | Percorre os efeitos disponíveis na unidade correspondente. |
| **FX assign 1A/1B … 4A/4B** | Liga/desliga o envio do canal correspondente para a unidade FX 1 ou 2. |
| **FX assign Master A/B** | Liga/desliga o envio do Master para a unidade FX 1 ou 2. |

## Instalação

1. Baixe `Numark NS6.midi.xml` e `Numark-NS6-scripts.js` deste repositório.
2. Copie os dois arquivos para a pasta de controladores do Mixxx:
   - macOS: `~/Library/Application Support/Mixxx/controllers/`
   - Linux: `~/.mixxx/controllers/`
   - Windows: `%LOCALAPPDATA%\Mixxx\controllers\`
3. Nas preferências do Mixxx, abra **Controllers**, selecione **Numark NS6** e ative a controladora.
4. Recarregue o mapeamento ou reinicie o Mixxx depois de substituir os arquivos.

O mapeamento requer Mixxx 2.5 ou posterior. Faça uma cópia dos arquivos atuais antes de atualizar.

## Contribuições

Relatos de bugs e pull requests são bem-vindos. Ao relatar um problema, inclua a versão do Mixxx, o sistema operacional, a sequência exata de controles e, se possível, dados do MIDI Monitor ou log do Mixxx.

Desenvolvido por [@maurojuniorr](https://github.com/maurojuniorr), com agradecimentos à comunidade Mixxx e aos colaboradores da NS6 que compartilharam descobertas do protocolo e dados de teste.
