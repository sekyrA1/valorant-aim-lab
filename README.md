# VALORANT AIM LAB - 3D Web FPS & Retake Simulator

## Site publicado

Jogue pelo GitHub Pages: https://sekyrA1.github.io/valorant-aim-lab/

O deploy é feito automaticamente ao enviar alterações para `main`.

Um FPS 3D completo para navegador construído com **Three.js** e **Vite**, projetado para replicar com fidelidade a movimentação, física de tiro e mecânicas do **VALORANT**, além de contar com modos de treino de mira estilo **Aimlab** e **KovaaK's**, simulação real de **Retake com Defuse da Spike**, **Gráfico Oficial de Erro de Disparo** e **Modo de Hold de Pixel com Cenários Reais**.

---

## Minhas playlists

Na aba **Rotinas & Minhas playlists**, clique em **Nova playlist** para montar uma sequência com qualquer uma das 20 tasks. Cada etapa tem duração de 5 a 600 segundos, dificuldade própria e, quando disponível, variante ou cenário. Você pode reordenar, duplicar e remover etapas, editar o nome, iniciar a rotina e excluir com opção de desfazer.

Clique em **Salvar playlist** para guardar a sequência no `localStorage` deste navegador. Os dados continuam disponíveis ao recarregar ou reabrir o site no mesmo navegador; limpar os dados do site apaga as playlists. A execução mostra o progresso e gera um relatório por etapa e histórico local. Ao concluir ou sair, a dificuldade e as variantes anteriores do lobby são restauradas. Execute `npm run test:playlists` para verificar persistência e execução.

## 🎮 Modos de Jogo Inclusos

No lobby, escolha **Fácil**, **Normal** ou **Difícil**. A escolha vale para os 20 modos disponíveis e para as rotinas prontas: ajusta tamanho e velocidade dos alvos, reação e dano dos bots e duração dos modos individuais. Os spawns táticos são reposicionados para ficar fora de caixas e paredes.

**Anti-Rush — Ascent A:** defenda o site contra ondas pelo arco do A Main, protegido por uma smoke aliada. Destrua o drone de reconhecimento, o recon e a flash antes dos seus efeitos. Jett lança uma smoke no site, faz dash para dentro dela e sai para caçar o defensor; os demais inimigos atravessam a mesma smoke, abrem em lados variados e avançam ao redor das coberturas. A ordem de recon/flash, a presença de suporte e a ordem dos atacantes variam, mantendo smoke → dash → entradas. Barreiras invisíveis exclusivas do jogador mantêm a defesa no site. Fácil/Normal/Difícil têm 3/4/5 atacantes por onda, com velocidade, reação e cadência diferentes. Cada utilidade destruída rende pontos; negar todas dá bônus de onda perfeita. Execute `npm run test:anti-rush` para verificar a sequência, navegação, barreiras e efeitos.

1. **Novo: Hold de Pixel & Treino de Reação (Ângulos Reais do Valorant)**
   - Treine a arte de segurar pixels e off-angles contra bots que abrem de surpresa.
   - **4 Cenários Táticos Selecionáveis**:
     - **Ascent A-Main**: o bot abre em *wide swing* correndo pela porta principal.
     - **Ascent Heaven**: o bot realiza *jiggle peek* rápido na quina da sacada elevada.
     - **Crack 1mm (Pixel Seam)**: fresta milimétrica estreita entre duas caixas de Radianita onde o bot cruza correndo a 6.75 m/s.
     - **Aleatório (Imprevisível)**: o bot varia aleatoriamente entre strafe curto, jiggle ou wide swing!
   - **Medição Precisa de Tempo de Reação (ms)**:
     - Detecta e alerta caso o jogador atire antes do bot abrir (*Tiro Antecipado*).
     - Mede o tempo exato em milissegundos desde a aparição do bot até o disparo.
     - Sistema de Ranks de Reflexo:
       - `⚡ RADIANT (< 180 ms)`
       - `💎 IMORTAL (180 - 215 ms)`
       - `🔥 ASCENDENTE (216 - 250 ms)`
       - `🥉 PLATINA (251 - 300 ms)`
       - `🐢 LENTO (> 300 ms)`

2. **Simulação Real: Retake Bomb Site A (Ascent)**
   - Mapa 3D com caixas de Radianita, Gerador central, Heaven com rampa, Hell e Wine.
   - **Spike Plantada** com animação giroscópica e bipes progressivos.
   - **Mecânica de Defuse Idêntica ao Valorant**: segure `[F]` ou `[4]` (7s no total com **Checkpoint na metade de 3.5s**).
   - Bots posicionados em ângulos defensivos com linha de visão e tiros reativos.

3. **Aimlab Clássico: Gridshot**
   - 3 alvos ativos simultâneos na parede frontal.
   - Teste de 60 segundos com KPS (Kills per Second), precisão e pontuação.
   - Auto-refill de bala a cada eliminação.

4. **KovaaK's: Microshot (Precisão 1-Tap)**
   - Alvos ultra-pequenos para calibração de micro-flicks e precisão cirúrgica de primeiro tiro.

5. **KovaaK's: Strafe Tracking**
   - Alvo móvel com aceleração horizontal dinâmica para treino de rastreamento contínuo.

6. **The Range (Estande de Tiro)**
   - Treino livre com bots para aquecimento e calibração de sensibilidade.

---

## 📊 Gráfico Oficial de Erro de Disparo (Shooting Error Graph)

Fiel ao gráfico oficial de Erro de Disparo do Valorant:
- Localizado no canto inferior da tela em tempo real.
- Plota cada tiro disparado em um histograma dinâmico com cores de diagnóstico:
  - **Barras Azuis (`#00c3ff`)**: **Erro de Movimento** (disparos realizados em corrida, caminhada acima do deadzone ou no ar).
  - **Barras Laranjas (`#ff9900`)**: **Erro de Disparo / Recuo** (acúmulo de dispersão por disparos consecutivos e spray).
  - **Ponto Verde na Linha Base**: Tiro 100% preciso com o boneco cravado (*Dead-stopped*).
- Linha divisória de **Deadzone** e indicação em graus (`°`) do desvio exato do projétil.
- Pode ser ativado ou desativado a qualquer momento no menu de configurações.

---

## 🔫 Arsenal, Braços e Mãos em Primeira Pessoa

- **Modelos 3D Reais em GLB (`public/models/`) & Mãos Táticas de Agente**:
  - Modelos de armas de alta fidelidade: `vandal.glb`, `phantom.glb`, `guardian.glb`, `spectre.glb`, `classic.glb`, `sheriff.glb`, `operator.glb`, `knife.glb`.
  - Mãos e braços táticos articulados: `tactical_arms.glb` (rifles/SMGs), `tactical_arms_pistol.glb` (pistolas) e `tactical_arms_knife.glb` (faca).
  - Iluminação tática dedicada no viewmodel realçando os detalhes metálicos e fibra de carbono das luvas.
- **Lógica Completa de Animações em Primeira Pessoa**:
  - **Equip (*Pull*)**: Transição fluida ao empunhar com amortecimento inercial.
  - **Recuo e Disparo (*Shot Impulse*)**: Coice físico na arma e slide blowback na pistola.
  - **Recarga (*Reload*)**: Braço esquerdo alcança o carregador, o pente se solta (`magazine`), o tambor gira (`cylinder` no Sheriff) ou a alavanca é puxada (`bolt` na Operator), retornando para a guarda.
  - **Floreio com a Faca (*Inspect*)**: Pressione `[R]` com a faca em mãos para girá-la em 360°.
  - **Corte com a Faca (*Slash*)**: Ataque diagonal rápido em arco com corte no botão esquerdo.
- **Munição Reserva Infinita (`∞`) & Auto-Refill ao Eliminar**:
  - Toda arma conta com reserva infinita (`25 / ∞`, `30 / ∞`, `12 / ∞`).
  - Ao matar alvos nos modos de treino, o pente recarrega instantaneamente.
- **Arsenal Completo (8 Armas)**:
  - **Vandal**: 25 tiros, 160 de dano na cabeça (1-tap kill clássico).
  - **Phantom**: Silenciada, 30 tiros, alta cadência e recuo controlado.
  - **Guardian**: Rifle DMR semi-automático de precisão cirúrgica (195 de dano na cabeça, 0.0 de erro no primeiro tiro).
  - **Spectre**: Submetralhadora silenciada de altíssima cadência (13.3 tiros/s) e excelente precisão em movimento.
  - **Classic**: 12 tiros, semi-automático no botão esquerdo e **rajada de 3 tiros no botão direito**!
  - **Sheriff**: Revólver pesado de alto impacto (159 de dano na cabeça).
  - **Operator**: Sniper pesado com Scope ADS (zoom 3x e mira telescópica).
  - **Faca Tática**: Corte rápido no botão esquerdo, estocada no botão direito e **+5% de velocidade de movimento** ao correr com ela em mãos.
- **Troca Rápida de Slots**:
  - `[1]`: Primária | `[2]`: Secundária | `[3]`: Faca Tática.

---

## ⚡ Física e Movimentação Fiel ao Valorant

- **Velocidades Calibradas**: Corrida `6.75 m/s` (Faca `7.15 m/s`), Caminhada `3.75 m/s`, Agachamento `2.0 m/s`.
- **Counter-Strafing & Dead-Stopping**: Desaceleração ultrarrápida (`55 m/s²`) atingindo precisão absoluta no instante da parada.
- **Orientação de Spawn Corrigida**: Nasce sempre voltado a `0°` diretamente para a direção dos alvos e da Spike.

---

## 🎯 Personalizador de Mira & Sensibilidade

- **Sensibilidade Valorant 1:1** (`sens * 0.07`), display dinâmico de **eDPI** e FOV padrão de **103°**.
- **Personalizador de Mira**: Cores (Ciano, Verde, Amarelo, Vermelho, Branco, Rosa), contornos, ponto central, espessura, comprimento, offset e erro dinâmico de movimento e disparo.

---

## 📊 Sistema de Desempenho & Playlists (Voltaic & CS Yprac)

### ⚡ Ranking Voltaic Benchmark
- **9 Tiers Oficiais**: Ferro (`⚙️`), Bronze (`🥉`), Prata (`🥈`), Ouro (`🥇`), Platina (`💠`), Diamante (`💎`), Ascendente (`🟢`), Imortal (`🔮`) e Radiante (`⚡`).
- **Cálculo de Pontos Voltaic**: Combina pontuação da sessão, precisão percentual, taxa de headshot e vitórias em retakes clutch.
- **Barra de Progresso**: Exibe visualmente quantos pontos faltam para o próximo tier competitivo.
- **Estatísticas de Carreira**: Total de sessões, precisão média de carreira, headshot rate, melhor tempo de reação em hold de pixel, retakes vencidos e rotinas concluídas.
- **Histórico Completo**: Tabela detalhada com os últimos treinos, com data/hora, tipo de treino, score, precisão, headshots e badge de rank.
- **Exportação e Backup**: Botão para exportar todos os dados e histórico em formato **JSON** ou limpar dados quando desejar.

### 🎯 Rotinas de Treino (Playlists Estilo Voltaic & Yprac)
1. **Voltaic Valorant Benchmark** (4 Etapas • 2 min):
   - Etapa 1: *Microshot* (Micro-flicks com 1-tap)
   - Etapa 2: *Gridshot* (Speed flicking)
   - Etapa 3: *Strafe Tracking* (Rastreamento reativo)
   - Etapa 4: *Hold de Pixel Crack 1mm* (Reação pura milimétrica)
2. **Yprac Ascent: Pre-Aim & Retake** (3 Etapas • Estilo CS Yprac):
   - Etapa 1: *Pre-Aim A-Main Swing* (Hold de wide swing de atacantes)
   - Etapa 2: *Pre-Aim Heaven Balcony* (Pre-aim vertical na sacada)
   - Etapa 3: *Retake Ascent A 1v5 Clutch* (Saída da sala de staging, eliminação de 5 defensores e defuse da Spike)
3. **Aquecimento Pré-Ranqueada** (4 Etapas • 2.5 min):
   - The Range (Calibração motora livre) -> Microshot -> Gridshot -> Retake Site A.

### 🎮 Interface & HUD de Playlist
- **HUD Playlist Pill**: Mostra o nome da rotina, a etapa atual (`ETAPA 2/4`) e barra de progresso gradual durante a partida.
- **Transição Entre Etapas**: Banner dinâmico com som e animação exibindo pontuação conquistada e contagem regressiva de 2s para a próxima etapa.
- **Relatório Final da Playlist**: Modal com avaliação de desempenho Voltaic, total de pontos adicionados à carreira, pontuação combinada e breakdown card para cada etapa.

---

## ⌨️ Controles

| Tecla | Ação |
|---|---|
| `W`, `A`, `S`, `D` | Movimentação |
| `Shift` | Andar Silencioso (Walk) |
| `Ctrl` ou `C` | Agachar (Crouch) |
| `Espaço` | Pular (Jump) |
| `1`, `2`, `3` | Slots de Armas (Primária / Pistola / Faca) |
| `Botão Esquerdo` | Atirar / Corte com Faca |
| `Botão Direito` | Mira Zoom (Operator) / Rajada 3 tiros (Classic) / Estocada (Faca) |
| `R` | Recarregar (Reserva Infinita `∞`) |
| `F` ou `4` | Defusar Spike (Modo Retake) |
| `ESC` | Pausar / Configurações |

---

## 🚀 Como Executar

Servidor ativo em:
```
http://127.0.0.1:5173/
```
