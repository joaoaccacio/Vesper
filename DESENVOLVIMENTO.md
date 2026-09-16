# VESPER — campanha Offline

## Jogar

Abra `index.html` no navegador. O HTML inclui todo o CSS, JavaScript, desenhos, ícones e áudio sintetizado. Não exige instalação, conexão, servidor ou dependências. O ZIP de entrega contém esse mesmo arquivo completo.

WASD/setas ou controle de toque movem o personagem; os ataques são automáticos. Esc/P pausa; 1/2 escolhe a melhoria; M alterna o som; F solicita tela cheia.

## Campanha

- Quatro mapas de 4.800 × 3.600 unidades, com câmera e personagens limitados às bordas.
- Minichefe aos 150 segundos e chefe final aos 240 segundos de tempo efetivo da partida. Pausas e escolhas de melhoria congelam esse relógio.
- Vencer o chefe final encerra a fase e registra a conquista. A fase e a skin conquistada recebem moldura dourada.
- Castelo/Mansão: Vampiro. Egito Antigo/Deserto: Múmia. Pântano: Zumbi. Halloween: Jack o’ Lantern. Os quatro mapas liberam o Sobrevivente.
- Humano, Fantasma e Encapuzado estão disponíveis desde o início. Todos os personagens compartilham os mesmos atributos.
- Alien, Aranha, Esqueleto e Bruxa têm suas aparências prontas e ficam reservados para moedas do futuro modo Online. Não há compras ou geração de moedas nesta versão.
- O minimapa mostra o mundo inteiro, a área visível e o jogador em vermelho. Ele muda de canto quando cobriria o jogador.

O progresso é salvo no navegador em `vesper.progress.v2`; recordes antigos não liberam conquistas da campanha. A versão anterior completa está em `archive/vesper-sanctuary-legacy.html`, preservada para o futuro Online.

## Fontes e construção

- `vesper-engine.js`: simulação, combate, mapas, chefes, desenhos e som.
- `vesper-characters.js`: catálogo único e desenhos das aparências.
- `vesper-ui.js`: menus, controles, acessibilidade, seleção de mapas e salvamento.
- `vesper-campaign.css`: estilos das telas da campanha.
- `index.html`: marcação e arquivo unificado de entrega.

Depois de editar as fontes, execute `node build.cjs`. A construção verifica a sintaxe, incorpora os três módulos e os estilos, rejeita dependências externas e atualiza também `VESPER/index.html`.

## Verificação

`node test-vesper.cjs` executa 39 verificações do motor e da interface: combate, movimento, pausa, XP, limites, encontros, vitória, salvamento, skins, minimapa e integridade do HTML unificado.

`node sim-balance.cjs 360 7 42` simula oito partidas com atributos normais, coletando gemas e escolhendo somente melhorias oferecidas. Os resultados ficam em `balance-report.json`. O controlador é automatizado; os resultados não substituem testes de dificuldade com jogadores humanos.

Para repetir a inspeção visual: `node build-qa.cjs`, depois `node preview.cjs`, e abra `http://127.0.0.1:4173/qa.html`. Os botões de teste exercitam o combate e os callbacks reais, permitindo inspecionar chefes, gemas, vitórias, limites, melhorias e Game Over. O salvamento dessa página usa um prefixo separado para não alterar o progresso do jogador. `qa.html` e seus controles não fazem parte do ZIP nem do HTML de entrega.

A versão foi inspecionada no navegador em desktop, celular e paisagem, incluindo as quatro vitórias e as molduras douradas.
