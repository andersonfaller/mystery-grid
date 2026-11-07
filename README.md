# mystery-grid

Uma grade. Algumas casas acesas. Apague todas.

Abra `index.html` em qualquer navegador — não há build nem dependências.
Também funciona servido como página estática (ex.: GitHub Pages).

- clique / toque: inverte
- `↶` · `z` · `Backspace`: desfaz
- `↺` · `r`: volta ao início do nível
- `?l=N` na URL: pula para o nível N (para testes)

O progresso fica no `localStorage` do navegador.

<details>
<summary>Como funciona (spoiler)</summary>

Um clique em `(x, y)` inverte a casa `(x + dx, y + dy)` se e somente se

```
(dx, dy) = (0, 0)   ou   [ Q(u, v) ∈ S   e   L(u, v) ≥ 0 ]

Q(u, v) = a·u² + b·u·v + c·v²     forma quadrática ("distância")
L(u, v) = p·u + q·v + r           semiplano ("direção")
(u, v)  = (dx, dy)                na face clara
(u, v)  = T(dx, dy)               na face escura, T ∈ simetrias do quadrado
```

A face de uma casa vem de uma zona (cor no xadrez, paridade da linha ou da
coluna). Algumas leis transformam o tabuleiro num toro. Tudo cabe numa janela
5×5 em volta do clique.

Cada lei dura 3 níveis (as bolinhas embaixo) e tem sua própria paleta. As 6
primeiras são escolhidas à mão para ensinar sem palavras; as seguintes são
geradas por uma semente fixa por capítulo, com filtros (4–8 casas por figura,
faces diferentes entre si, nunca igual à lei anterior).

Cada clique é um XOR com uma máscara que só depende da posição, então cliques
comutam e cada um desfaz a si mesmo. O tabuleiro inicial é gerado aplicando k
cliques ao tabuleiro vazio, verificando em GF(2) que são linearmente
independentes; refazer esses k cliques sempre o resolve. O primeiro nível de
cada lei é uma revelação (a figura aparece inteira, uma por face); os
seguintes misturam figuras próximas para que se sobreponham.

A grade se adapta à tela e fica mais fina a cada capítulo.

Testes da lógica: `node --test`
</details>
