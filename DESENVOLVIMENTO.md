# VESPER — campanha Offline e Arena Online

## Jogar

Abra `VESPER/index.html` no navegador. O HTML inclui todo o CSS, JavaScript, desenhos, ícones e áudio sintetizado. Não exige instalação, conexão, servidor ou dependências. Atualize sempre essa pasta; não crie nem atualize arquivos ZIP sem pedido explícito do usuário.

Na campanha, WASD/setas ou controle de toque movem o personagem e os ataques são automáticos. Ao andar, o personagem levanta uma poeira curta e discreta. Esc/P pausa; 1/2 escolhe a melhoria; M alterna o som; F solicita tela cheia.

No modo Online o tiro é manual e a mira é automática: WASD move, a mira trava sozinha no alvo mais próximo, seja jogador ou caixa de XP e a barra de espaço dispara. Essa versão foi feita e testada para desktop.

## Campanha

- Seis mapas de 4.800 × 3.600 unidades, com câmera e personagens limitados às bordas. Depois de escolher o mapa, selecione Fácil, Médio ou Difícil; o modo altera vida, velocidade, dano e ritmo das ondas. No Difícil os monstros têm 55% mais vida, 16% mais velocidade, 50% mais dano e as ondas chegam 30% mais rápido.
- Minichefe aos 150 segundos e chefe final aos 240 segundos de tempo efetivo da partida. Pausas e escolhas de melhoria congelam esse relógio.
- Vencer o chefe final encerra a fase e registra a conquista. A fase e a skin conquistada recebem moldura dourada.
- Castelo/Mansão: Vampiro. Egito Antigo/Deserto: Múmia. Pântano: Zumbi. Halloween: Jack o’ Lantern. Fundo do Mar: Kraken. Montanhas Geladas: Yeti. Concluir todos os mapas libera o Sobrevivente.
- Os personagens andam com um balanço curto do corpo e um leve gingado, na campanha e no Online; parados, só respiram.
- Humano, Fantasma e Encapuzado estão disponíveis desde o início. Todos os personagens compartilham os mesmos atributos. As oito skins do Online aparecem na mesma tela, em uma seção própria, e são compradas com as moedas do ranking.
- O minimapa mostra o mundo inteiro, a área visível e o jogador em vermelho. Ele muda de canto quando cobriria o jogador.

O progresso é salvo no navegador em `vesper.progress.v2`; recordes antigos não liberam conquistas da campanha.

## Modo Online

O Online tem servidor proprio. Ele nao usa nada de fora: o servidor e um arquivo Node sem dependencias que serve o jogo e a partida na mesma porta.

### Subir o servidor

```
node build.cjs
node vesper-server.cjs
```

O terminal mostra o endereco. Abra `http://127.0.0.1:8080` para jogar. Quem estiver na mesma rede entra pelo IP da maquina, por exemplo `http://192.168.0.10:8080`. Para jogar com gente de outra casa, o servidor precisa estar acessivel pela internet: uma hospedagem Node (`npm start`), um tunel ou redirecionamento de porta no roteador. O campo SERVIDOR na tela do Online aceita `meu-servidor.com:8080`, `http://...` ou `ws://...`; em branco, o jogo usa o endereco da propria pagina.

Variaveis de ambiente: `PORT`, `HOST`, `VESPER_MATCH_SECONDS`, `VESPER_CAPACITY` e `VESPER_BOT_FILL`. A rota `/status` devolve as salas abertas em JSON.

Abrir `VESPER/index.html` direto do disco continua valendo para a campanha offline. O Online, nesse caso, procura o servidor em `ws://127.0.0.1:8080`; aberto pelo servidor, o jogo sempre conecta no mesmo endereco da pagina. O jogador nunca ve nem digita endereco de servidor.

### Como a partida funciona

- O servidor manda em tudo: vida, dano, abates, XP, nivel, tiros, caixas e relogio. O cliente envia apenas a direcao do movimento e se esta atirando, desenha o que recebe e preve o proprio movimento entre um pacote e outro. Se o cliente discordar, o servidor vence.
- A cadencia de tiro, a velocidade e o dano saem da arma do nivel no servidor, entao pedido exagerado do cliente nao adianta.
- O servidor roda a 20 pacotes por segundo. Nome e aparencia viajam so na entrada; cada pacote leva posicoes, vida, nivel e abates.
- Cada servidor tem quinze vagas. Entra-se na sala mais cheia com vaga e uma sala nova abre sozinha quando todas lotam. A sala aceita gente por quatro minutos e some trinta segundos depois do fim.
- Caiu a conexao? O lugar fica guardado por trinta segundos e volta com nivel, abates e XP intactos.
- Os bots rodam no servidor e andam de lado com menos força e um pouco mais devagar que os humanos, para os tiros acertarem com mais frequência. A sala espera oito segundos por gente de verdade e completa o resto com bots, sorteando nomes de uma lista de duzentos nomes comuns nos Estados Unidos. Quando alguem entra, o bot de pior desempenho sai. Para o jogador, bots e humanos sao indistinguiveis em texto: o ranking, o feed e a tela final mostram so nomes e o total de jogadores. A unica diferenca visivel e a cor do nome e do ponto no minimapa.
- Abater gente de verdade paga o dobro em moedas; abater bot paga a metade.
- O mapa e dividido em quinze zonas e cada lutador nasce em uma zona so sua. Ao renascer, vale a zona mais distante de quem esta vivo.
- Cada partida dura cinco minutos na arena Catedral em Ruinas (4.000 x 3.000 unidades), com praca do ritual no centro, duas colunatas, quatro patios de criptas, braseiros e caixas de XP. A arena tem piso, muralha e vinheta proprios, de contraste baixo.
- Todos nascem no nivel 1 com um revolver e sobem ate o nivel 10, que troca a arma, o dano e a vida maxima: Revolver, Pistola, Pistola Automatica, Escopeta, Submetralhadora, Carabina, Rifle, Fuzil de Assalto, AK-47 e Metralhadora Vesper. A vida vai de 180 a 540 e o dano por segundo de 34 a 170.
- Cada arma tem desenho proprio, no mesmo traco dos personagens, equipado na mao do lutador e virado para a mira; o mesmo desenho aparece como icone no HUD. Toda arma dispara um tiro por vez: so a habilidade do Cyborg acrescenta um segundo projetil.
- A mira e automatica, travada no alvo mais proximo (jogador ou caixa de XP), ignorando quem acabou de nascer e ainda esta intocavel; o disparo e manual, na barra de espaco.
- No fim da partida o ranking ordena todos por nivel e depois por abates, e a posicao define as moedas.

As moedas compram as oito skins do Online, que valem somente nessas partidas. Os dois elencos sao separados no motor: uma skin paga nao vira personagem da campanha e um heroi da campanha nao entra na arena, nem para os bots. O Alien ja vem desbloqueado e cada skin tem uma habilidade propria: Alien nenhuma, Aranha velocidade de ataque +10%, Esqueleto velocidade de ataque +15%, Orc dano +20%, Homem Invisivel velocidade +25%, Cyborg +1 projetil, Medico da Peste tiros que envenenam por tres segundos e Frankenstein dano +30%. A carteira fica salva no navegador em `vesper.online.v1`.

## Inimigos e personagens

Cada cenário tem seis inimigos com desenhos próprios e um minichefe: Cavaleiro no Castelo, Escorpião Gigante no Egito, Sapo Gigante no Pântano, Espantalho no Halloween, Tubarão no Fundo do Mar e Mamute nas Montanhas Geladas. O Fundo do Mar traz caranguejo, água-viva, baiacu, piranha, pirata afogado e enguia elétrica, com naufrágio, corais, algas, âncoras e bolhas subindo. As Montanhas Geladas trazem boneco de neve, coruja das neves, urso polar, pinguim, viking congelado e espírito da nevasca, com pinheiros, cabanas, cristais de gelo, lagos congelados e neve caindo. As aparências usam os mesmos atributos e movimentos de antes. Os chefes finais continuam sendo os personagens desbloqueáveis de cada mapa. O Sobrevivente carrega um machado de pedra lascada, com cabo de madeira e amarrações de corda.

## Regra do código

O código deste projeto não leva comentários, por ordem do usuário. Nomes de função e de variável devem explicar sozinhos o que o trecho faz. A documentação fica aqui, no `DESENVOLVIMENTO.md`.

## Fontes e construção

- `vesper-engine.js`: simulação, combate, mapas, chefes, desenhos e som.
- `vesper-characters.js`: catálogo único e desenhos das aparências.
- `vesper-enemies.js`: desenhos e nomes dos seis inimigos e do minichefe de cada cenário.
- `vesper-arena.js`: nucleo da partida online, usado pelo servidor e pelo cliente. Armas, habilidades, bots, zonas de nascimento, XP e ranking.
- `vesper-online.js`: cliente do Online. Conexao, espelho do estado do servidor, desenhos da arena, das armas e dos lutadores.
- `vesper-server.cjs`: servidor HTTP e WebSocket, salas, autoridade da partida e bots.
- `vesper-ui.js`: menus, controles, acessibilidade, seleção de mapas e salvamento.
- `vesper-campaign.css`: estilos das telas da campanha.
- `vesper-online.css`: estilos das telas, do HUD e do ranking do Online.
- `index.html`: matriz do HTML unificado usada pelo construtor.
- `VESPER/index.html`: versão final pronta para abrir e jogar.

Depois de editar as fontes, execute `node build.cjs`. A construção verifica a sintaxe, incorpora os seis módulos e as duas folhas de estilo, rejeita dependências externas e atualiza também `VESPER/index.html`.

## Verificação

`node test-vesper.cjs` executa as verificações do motor e da interface: combate, movimento, pausa, XP, limites, encontros, vitória, salvamento, skins, minimapa, integridade do HTML unificado e, no Online, o espelho do estado do servidor, a predição local, os eventos, o ranking final, a separação entre modos e os desenhos da arena e das armas.

`node test-server.cjs` sobe o servidor de verdade e conecta clientes WebSocket reais: quadro do protocolo, duas pessoas na mesma sala, autoridade sobre movimento e cadência de tiro, sala cheia abrindo outra sala, bots preenchendo e cedendo lugar, reconexão com o mesmo lugar, ranking final com moedas e resistência a mensagem inválida. `npm test` roda as duas suítes.

`node sim-balance.cjs 360 7 42` simula oito partidas com atributos normais, coletando gemas e escolhendo somente melhorias oferecidas. O comando gera temporariamente `balance-report.json`, ignorado pelo Git e descartável. O controlador é automatizado; os resultados não substituem testes de dificuldade com jogadores humanos.

Para repetir a inspeção visual: `node build-qa.cjs`, depois `node preview.cjs`, e abra `http://127.0.0.1:4173/qa.html`. O primeiro comando gera temporariamente `qa.html`, ignorado pelo Git e descartável. Os botões de teste exercitam o combate e os callbacks reais, permitindo inspecionar chefes, gemas, vitórias, limites, melhorias e Game Over. O salvamento dessa página usa um prefixo separado para não alterar o progresso do jogador.

A versão foi inspecionada no navegador em desktop, celular e paisagem, incluindo as quatro vitórias e as molduras douradas.
