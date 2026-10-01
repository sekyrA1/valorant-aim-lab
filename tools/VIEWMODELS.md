# Modelos de primeira pessoa

## Armas principais remodeladas

Vandal, Phantom, Classic, Sheriff e Operator agora usam malhas novas em acabamento
padrão, modeladas no Blender a partir das silhuetas do [arsenal oficial](https://playvalorant.com/en-us/arsenal/).
São aproximações originais, não modelos extraídos do jogo. Foram refeitos corpos,
coronhas, carregadores, miras, empunhaduras, bocas dos canos e mecanismos.

Fontes editáveis: `assets/blender/{vandal,phantom,classic,sheriff,operator}.blend`.
Os GLBs em `public/models/` mantêm os sockets do viewmodel. Grupos com o extra
`viewmodelRole` controlam carregador, slide, tambor e ferrolho, sem animar as
superfícies filhas duas vezes. Spectre, Guardian e faca mantêm seus modelos atuais.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --factory-startup --python tools/build_standard_weapons.py
node tools/verifyWeapons.mjs
node tools/verifyArms.mjs
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --factory-startup --python tools/render_standard_weapons.py
```

Use esse gerador para as cinco armas atuais. `build_viewmodels.py` é o gerador
legado e sobrescreve essas armas com as versões antigas se executado.

## Braços com rig e IK (versão atual)

As oito armas usam `public/models/arms_rigged.glb`, com 34 ossos, pesos normalizados,
três malhas por material e dedos com três falanges. O arquivo `arms_rigged.blend`
contém a fonte editável, alvos de punho e polos de cotovelo com constraints IK.
Os antigos `tactical_arms*.glb` permanecem como assets legados.

`src/armsIK.js` resolve os dois segmentos de cada braço a cada frame. Os ombros
ficam no espaço da câmera, as mãos seguem as pegadas da arma e os cotovelos
usam polos laterais. A extensão é limitada e há compensação de ombro nos
extremos. Cada instância usa `SkeletonUtils.clone`, com skeleton independente.
O rig acompanha pull, respiração/idle, recuo/tiro, recarga e golpes da faca.
A recarga tem fases de soltar, alcançar, retirar, inserir e retornar, com ação
final do slide da Classic e do ferrolho da Operator; Sheriff usa o tambor.

Recriar somente os braços, verificar deformação e renderizar poses reais do IK:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --factory-startup --python tools/build_rigged_arms.py
node tools/verifyArms.mjs
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --factory-startup --python tools/render_rigged_arms.py
npm run build
```

As animações são calculadas no Three.js; não são clipes gravados no GLB.
Os braços têm proporções e deformações mais naturais, com acabamento estilizado.

## Histórico dos modelos legados

Os arquivos em `public/models/` foram gerados com Blender 5.1:

- Armas atuais: `vandal.glb`, `phantom.glb`, `classic.glb`, `sheriff.glb`, `operator.glb`, `knife.glb`.
- Braços: `tactical_arms.glb` para rifles, `tactical_arms_pistol.glb` para pistolas e `tactical_arms_knife.glb` para faca.
- Assets da etapa anterior, também sem integração: `spectre.glb`, `guardian.glb`.

Os seis modelos atuais são carregados por `src/weapons.js` junto com o par de braços apropriado. O modelo procedural antigo aparece como fallback enquanto o `.glb` carrega. O eixo `-Z` aponta para a frente e `Y` aponta para cima. Os pivôs `LeftArm` e `RightArm` permitem movimentar a mão de apoio na recarga.

As curvas de equipar (*pull*), idle, tiro e recarga ficam em `src/viewmodelProfiles.js`. Peças nomeadas no Blender, como `magazine`, `slide`, `cylinder` e `bolt_handle`, recebem movimentos adicionais durante tiro ou recarga. A faca executa um floreio ao pressionar `R`.

As pontas aproximadas para efeitos de disparo são Vandal `Z=-0.82`, Phantom `-0.81`, Classic `-0.25`, Sheriff `-0.41` e Operator `-1.15`. Spectre `-0.71` e Guardian `-0.91` continuam como assets não equipáveis.

Para recriar os assets:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --factory-startup --python tools/build_viewmodels.py
```

Para recriar as imagens em `previews/`:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --factory-startup --python tools/render_viewmodels.py
```
