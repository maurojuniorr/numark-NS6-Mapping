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

## Instalação

1. Baixe `Numark NS6.midi.xml` e `Numark-NS6-scripts.js` deste repositório.
2. Copie os dois arquivos para a pasta de controladores do Mixxx:
   - macOS: `~/Library/Application Support/Mixxx/controllers/`
   - Linux: `~/.mixxx/controllers/`
   - Windows: `%LOCALAPPDATA%\Mixxx\controllers\`
3. Nas preferências do Mixxx, abra **Controllers**, selecione **Numark NS6** e ative a controladora.
4. Recarregue o mapeamento ou reinicie o Mixxx depois de substituir os arquivos.

O mapeamento requer Mixxx 2.5 ou posterior. Faça uma cópia dos arquivos atuais antes de atualizar.

## Testes

O repositório inclui testes Node.js para o protocolo MIDI e o comportamento do mapeamento. Execute-os na raiz do projeto:

```sh
node --test tests/*.test.cjs
```

Os testes automatizados não substituem o teste com a NS6. LEDs, resposta dos jogs e comportamento de áudio devem ser conferidos no hardware de destino.

## Contribuições

Relatos de bugs e pull requests são bem-vindos. Ao relatar um problema, inclua a versão do Mixxx, o sistema operacional, a sequência exata de controles e, se possível, dados do MIDI Monitor ou log do Mixxx.

Desenvolvido por [@maurojuniorr](https://github.com/maurojuniorr), com agradecimentos à comunidade Mixxx e aos colaboradores da NS6 que compartilharam descobertas do protocolo e dados de teste.
