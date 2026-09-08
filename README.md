# NEON DRIVE

Corrida arcade de estética synthwave, com motor pseudo-3D em **Canvas 2D**.
O projeto antes monolítico agora tem `index.html` com cerca de 100 linhas de HTML,
estilos em `css/game.css` e JavaScript modularizado em scripts clássicos com IIFEs
sob o namespace `window.NeonDrive`.
Sem bibliotecas externas, downloads de assets, npm, instalação, build ou servidor
obrigatório para jogar.

## Jogar

Abra `index.html` em um navegador moderno, escolha **Clássico** ou **Fórmula**,
configure a corrida e selecione **Iniciar corrida**.
Para abrir diretamente via `file://`, mantenha as pastas `js/` e `css/` junto de
`index.html`, preservando seus arquivos e subpastas: o HTML não é mais autocontido.
Os scripts são carregados na ordem declarada no HTML, sem módulos ES ou bundler.
Também funciona em hospedagem estática. O áudio começa após a interação com o jogo;
sua indisponibilidade não impede a corrida.

| Ação             | Jogador 1 | Jogador 2 |
| ---------------- | --------- | --------- |
| Dirigir          | ← / →     | A / D     |
| Acelerar / frear | ↑ / ↓     | W / S     |
| Nitro            | Espaço    | F         |
| Derrapar         | Shift     | G         |

Atalhos gerais: **P** pausa, **C** alterna câmera, **Q** alterna qualidade e **M** silencia.
Em modo solo, WASD também controla o primeiro jogador.
Há botões de toque, suporte a gamepads com remapeamento e tela dividida para dois jogadores.
Os mapeamentos de controle são armazenados apenas no `localStorage` do navegador.

Nenhum modo tem progressão persistente. Corridas, resultados e o recorde da sessão
do Clássico ficam em memória; não há salvamento de carreira ou de progresso entre sessões.

## Modos de corrida

### Clássico

O modo original de rodovia foi preservado, com quatro faixas, oito biomas, tráfego
de carros e caminhões, derrapagens, nitro, colisões, combos e pontuação.

- Corrida contra o tempo, sem limite de voltas. Cada checkpoint, a cada quarto de
  volta, acrescenta tempo e 2.500 pontos se alcançado antes de o tempo acabar.
- Pontos por distância, derrapagens, coletas de nitro e ultrapassagens por pouco
  ("QUASE!"), com multiplicador de combo. Colisões reduzem velocidade e quebram o combo.
- Cápsulas na pista repõem uma carga de nitro, respeitando a capacidade da dificuldade.
- Em dois jogadores, cada um tem seu próprio tempo e pontuação; a partida termina
  quando o tempo de todos se esgota. A classificação é por pontuação.

| Dificuldade | Tempo inicial | Bônus por checkpoint | Veículos de tráfego | Nitro inicial / capacidade |
| ----------- | ------------- | -------------------- | ------------------- | -------------------------- |
| Fácil       | 95 s          | +22 s                | 44                  | 2 / 4                      |
| Médio       | 80 s          | +15 s                | 62                  | 1 / 3                      |
| Difícil     | 62 s          | +11 s                | 86                  | 1 / 2                      |

### Fórmula

- **Quatro circuitos:** Interlagos, Mônaco, Monza e Suzuka. São interpretações arcade
  com trechos característicos, **não réplicas geométricas oficiais** dos autódromos.
- **12 pilotos no total, incluindo os humanos:** um jogador e 11 IAs ou dois
  jogadores e 10 IAs. Há três dificuldades.
- **Três voltas**, precedidas por contagem de largada de **três segundos**, durante
  a qual física, tráfego e relógio da prova ficam parados.
- **Sem cronômetro regressivo de tempo-limite.** O tempo decorrido serve à
  cronometragem da prova, da última volta e da melhor volta.
- **Três pinturas originais:** Rubi, Ouro e Azul; câmera externa e **cockpit F1**
  próprio para o monoposto.
- **Nitro:** começa com três cargas, capacidade máxima de três e reposição de uma
  carga por volta completada. Não há cápsulas de nitro na pista deste modo.
- Classificação por progresso durante a prova e por tempo de chegada para quem
  terminou, com posição, voltas e cronometragem no HUD e resultados.
- Adversários com ritmos e estilos próprios de largada, aceleração e curvas.
  Procuram trajetórias livres para ultrapassar, respeitam carros próximos e os
  jogadores, e freiam quando não há espaço. Sem teletransportes ou recuperação
  artificial de distância em relação ao jogador.
- A prova termina quando todos os humanos completam as três voltas. Em tela
  dividida, quem chegou aguarda o outro; IAs ainda não finalizadas aparecem como
  **EM PISTA**, sem receber um tempo de chegada fictício.

## Visual e pista

- Rodovia do Clássico com **quatro faixas**, 45% mais larga que a rodovia anterior.
- Esportivo do jogador, GTs, cupês, sedãs e caminhões modelados proceduralmente.
- Pintura com iluminação especular, teto pintado, vidros escuros, persianas, retrovisores,
  jantes com raios, discos e pinças de freio, lanternas LED, placas e difusores.
- Carrocerias opacas: os sprites recortam as luzes que estão atrás deles na camada
  emissiva. Somente as superfícies luminosas contribuem para o bloom.
- Tráfego com posição interpolada, ângulos de direção e colisões proporcionais à carroceria,
  independentemente da margem transparente dos sprites.
- Asfalto com trilhas de rodagem e detalhes de superfície, acostamentos, guarda-corpos,
  litoral com água e reflexos, skyline urbano, nuvens e aurora na geleira.
- Oito biomas no Clássico, ciclo dia/noite, câmera externa e cockpit, áudio e música procedurais.
- Monopostos retrô, zebras, grid, boxes, arquibancadas e placas de frenagem na Fórmula.
- Três níveis de qualidade; os detalhes adicionais do asfalto e da aurora são reduzidos
  ou omitidos na qualidade baixa.

Carros, pinturas e elementos visuais são criações originais de estética retrô,
sem logotipos ou assets licenciados e sem copiar Horizon Chase ou jogos de Senna.
Os nomes dos circuitos identificam as inspirações, não uma reprodução oficial.

## Organização do motor

Os módulos usam IIFEs para encapsular a implementação e expõem suas APIs em
`window.NeonDrive`. A ordem dos scripts em `index.html` faz parte do contrato de
carregamento; não há `import`/`export` nem resolução de dependências por npm.

| Caminho                  | Responsabilidade                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `index.html`             | Estrutura HTML, telas, Canvas e ordem de carregamento dos scripts.                                          |
| `css/game.css`           | Estilos da interface, menus e controles de toque.                                                           |
| `js/core/utils.js`       | Utilitários matemáticos e cálculo dos viewports.                                                            |
| `js/core/race.js`        | Simulação e física compartilhadas: jogadores, colisões, nitro, relógio e aplicação das regras de cada modo. |
| `js/world/track.js`      | Construção da rodovia e dos circuitos, segmentos, decoração, pickups e atualização do tráfego/IA.           |
| `js/world/circuits.js`   | Definições dos quatro circuitos: trechos, curvas, elevações e biomas.                                       |
| `js/world/formula-ai.js` | Perfis dos pilotos, leitura das curvas, escolha de trajetória e ultrapassagens da IA da Fórmula.            |
| `js/modes/classic.js`    | Dificuldades e regras de tempo, checkpoints, pontuação, classificação e resultados do Clássico.             |
| `js/modes/formula.js`    | Regras de largada, voltas, recarga de nitro, cronometragem, classificação e resultados da Fórmula.          |
| `js/assets/models.js`    | Malhas procedurais, projeção e iluminação dos modelos de veículos.                                          |
| `js/assets/sprites.js`   | Geração e catálogo de sprites, incluindo os monopostos.                                                     |
| `js/render/display.js`   | Canvas, camadas de cor/emissão, viewports e composição/pós-processamento.                                   |
| `js/render/scene.js`     | Cenário e pista em perspectiva, sprites, interpolação, recorte em colinas e oclusão emissiva.               |
| `js/render/cockpit.js`   | Cockpits do Clássico e da Fórmula.                                                                          |
| `js/render/hud.js`       | HUD de velocidade, nitro, pontuação, posição, voltas e tempos conforme o modo.                              |
| `js/input.js`            | Teclado, toque, gamepads e remapeamento de controles.                                                       |
| `js/audio.js`            | Áudio e música procedurais.                                                                                 |
| `js/ui.js`               | Menus, opções, pausa, remapeamento e apresentação dos resultados.                                           |
| `js/main.js`             | Inicialização, composição dos módulos, loop de passo fixo e preparação dos frames de renderização.          |
| `js/errors.js`           | Captura e exibição de erros de inicialização/execução.                                                      |
| `tests/`                 | Suítes Node.js em arquivos `*.test.cjs`.                                                                    |

Os sprites são pré-renderizados e reutilizados, não reconstruídos a cada quadro.
O catálogo da Fórmula é gerado sob demanda na primeira seleção do modo.

### Contratos de simulação e renderização

- `ND.createWorld(SPR, settings)` cria o mundo; `ND.createRace(world, SPR, settings, sfx)`
  cria a simulação que aplica as regras de `ND.modes.classic` ou `ND.modes.formula`.
- `p.position` em `race.players` é a **posição física** do jogador na pista.
  Para `scene.render(frame)`, `main.js` prepara `frame.position` subtraindo
  `camDist * REFDEPTH`, com retorno circular pelo comprimento da pista. Essa é a
  **posição da câmera**, não uma alteração na física. Antes de desenhar cockpit e
  HUD, `main.js` restaura `frame.position = p.position`.
- O loop usa passos fixos de `1 / 60` s. Em cada tick ativo, a corrida atualiza o
  **tráfego compartilhado uma única vez**, antes dos jogadores, e avança o relógio
  da prova uma única vez após eles — nunca por jogador ou viewport. Renderizar
  duas telas não duplica a velocidade da IA nem o tempo decorrido.
- O argumento `elapsed` de `world.updateTraffic` e das regras de avanço dos modos
  representa o **início do passo**, permitindo interpolar os instantes de passagem
  de volta e chegada dentro do tick.

## Testes

Com Node.js 20 ou superior, na raiz do projeto, execute `node --test tests/*.test.cjs`.
O padrão inclui também novos arquivos de teste; não é necessário instalar pacotes.
Node.js é necessário apenas para esta validação automatizada, não para jogar.

A suíte usa `node:test`, asserções e `node:vm`: lê os atributos `src` dos scripts
de `index.html` e carrega os arquivos reais na mesma ordem em contextos isolados.
Não remove IIFEs por regex, não injeta exports e não reescreve os módulos de produção.
No harness de `tests/game.test.cjs`, `main.js` e `errors.js` são compilados para
verificar sintaxe, mas não executados; boot, DOM interativo, áudio e animação não
são exercitados por esse harness.

Os testes verificam comportamento unitário e integração dos módulos: referências
JS/CSS e sintaxe, faixas e tráfego, nitro, colisões, modelos, interpolação e oclusão,
viewports, circuitos, grid, largada, relógio compartilhado, pausa/reset, checkpoints,
classificação, voltas e chegadas interpoladas.

O Canvas simulado verifica chamadas e estados, não rasteriza pixels. A suíte
opcional `tests/browser.smoke.cjs` executa o jogo real no Chromium: abertura por
`file://`, troca de modo, largada, teclado, nitro, pausa, cockpit, 2P, resultado,
reinício e layout de 320/390 pixels. Esse smoke foi executado com sucesso.

Para executá-lo, use `node tests/browser.smoke.cjs` em um ambiente com Playwright
e Chromium instalados; pode-se passar o caminho de uma instalação do Playwright
como primeiro argumento. As capturas são gravadas na pasta temporária do sistema.
Essa ferramenta é opcional, não uma dependência do jogo. Qualidade sonora, gamepads
físicos e ergonomia em celulares ainda requerem validação nos dispositivos reais.

### Checklist manual

- [ ] Abrir por `file://` com `js/` e `css/` presentes; conferir menus e ausência de erros de carregamento.
- [ ] Clássico: testar tempo/checkpoints, pontuação/combos, nitro, colisões e fim por tempo esgotado.
- [ ] Fórmula: percorrer os quatro circuitos, três pinturas, largada, três voltas, recarga de nitro, classificação e resultados.
- [ ] Validar 1P/2P, câmera externa/cockpits, resize/orientação e qualidades, incluindo oclusão e HUD.
- [ ] Validar teclado, toque, gamepads/remapeamento, áudio/mute, pausa/retomada, reinício e troca de modo pelo menu.
