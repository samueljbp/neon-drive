# NEON DRIVE

Corrida arcade de estética synthwave, com motor pseudo-3D em **Canvas 2D**.
O jogo inteiro está em `index.html`: sem bibliotecas externas, downloads de assets,
servidor, instalação ou etapa de build.

## Jogar

Abra `index.html` em um navegador moderno e selecione **Iniciar corrida**.
Também funciona em hospedagem estática. O áudio começa após a interação com o jogo.

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

## Visual e pista

- Rodovia com **quatro faixas**, 45% mais larga que a versão anterior.
- Esportivo do jogador, GTs, cupês, sedãs e caminhões modelados proceduralmente.
- Pintura com iluminação especular, teto pintado, vidros escuros, persianas, retrovisores,
  jantes com raios, discos e pinças de freio, lanternas LED, placas e difusores.
- Carrocerias opacas: os sprites recortam as luzes que estão atrás deles na camada
  emissiva. Somente as superfícies luminosas contribuem para o bloom.
- Tráfego com posição interpolada, ângulos de direção e colisões proporcionais à carroceria,
  independentemente da margem transparente dos sprites.
- Asfalto com trilhas de rodagem e detalhes de superfície, acostamentos, guarda-corpos,
  litoral com água e reflexos, skyline urbano, nuvens e aurora na geleira.
- Oito biomas, ciclo dia/noite, câmera externa e cockpit, áudio e música procedurais.
- Três níveis de qualidade; os detalhes adicionais do asfalto e da aurora são reduzidos
  ou omitidos na qualidade baixa.

## Organização do motor

As funções em `index.html` estão agrupadas por responsabilidade:

- `buildCar`, `buildTruck`, `renderMesh`, `carSprites`: malhas, iluminação e sprites
  pré-renderizados na inicialização, não a cada quadro.
- `buildTrack`, `decorate`, `placeTraffic`: pista, biomas, objetos e tráfego.
- `update`: física, colisões, nitro, tempo e pontuação.
- `renderRoad`, `drawSprite`, `blitSprite`: perspectiva, recorte em colinas e oclusão emissiva.
- `renderView`, `composite`: tela dividida e pós-processamento.

## Testes

Com Node.js 20 ou superior, execute `node --test tests/game.test.cjs`.
Não é necessário instalar pacotes.

A suíte usa o JavaScript real do HTML em um contexto isolado e testa sintaxe,
faixas, tráfego, distribuição de nitro, proporções das colisões, oclusão emissiva,
interpolação, recorte, limites dos modelos e orientação da tela dividida.
Os testes de Canvas usam um contexto simulado: aparência, pixels, áudio e controles
físicos ainda exigem validação em navegador/dispositivo.
