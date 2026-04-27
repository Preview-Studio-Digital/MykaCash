## Problema

A tela de login deixou de aparecer no preview após eu importar o ícone `money-management.ico` como módulo (`import logo from "@/assets/money-management.ico"`). O Vite, por padrão, não trata `.ico` como asset importável de imagem em React, o que faz a página `/auth` falhar ao renderizar — por isso o preview ficou em branco.

## Correção

1. Servir o ícone como arquivo público em vez de import:
   - Manter o arquivo em `public/money-management.ico` (já copiado).
   - Remover o `src/assets/money-management.ico` (não será mais necessário).

2. Em `src/pages/Auth.tsx`:
   - Remover a linha `import logo from "@/assets/money-management.ico";`
   - Trocar `<img src={logo} ... />` por `<img src="/money-management.ico" ... />`

Com isso a página volta a renderizar e o ícone aparece normalmente acima do título "SMART MONEY".