# Cardápio Digital — Fórmula Açaí

Projeto inicial em HTML, CSS e JavaScript puro, com as imagens de marca fornecidas incluídas em `assets/`.

## Como executar
1. Extraia o ZIP.
2. Abra a pasta `formula_acai_cardapio`.
3. Abra `index.html` em um navegador moderno. Para uma experiência mais consistente, use uma extensão/servidor local (por exemplo, Live Server no VS Code).

## O que esta versão já demonstra
- Página inicial com logo e imagem de capa da Fórmula Açaí.
- Paleta roxo, branco e lilás.
- Categorias e cards com preço no formato “A partir de”.
- Página individual do produto com adicionais, acompanhamentos e quantidade; fotos ampliadas nos cards e na visualização do produto.
- Barra fixa do carrinho e resumo do pedido.
- Formulário de finalização e montagem da mensagem para WhatsApp `55 62 9 9415 0444`.
- Painel de gestão com senha de demonstração `fa.oficial` e opção de mostrar/ocultar.
- Cadastro, edição, ativação/inativação e exclusão confirmada de produtos e adicionais.
- Produto associado a mais de uma categoria.
- Campo interno de tipo de produto: “Produto pronto da loja” ou “Montado conforme escolha do cliente”. Essa informação não é exibida ao consumidor.
- Ao selecionar “Montado conforme escolha do cliente” no cadastro/edição, a gestão exibe campos próprios para definir o limite de acompanhamentos e o limite de cremes/caldas daquele produto. Cada produto pode ter quantidades diferentes.
- Nos produtos personalizados, o cliente deve selecionar o tamanho do copo antes de adicionar ao carrinho. Os tamanhos (ex.: 300 ml, 500 ml, 700 ml e 1 litro) podem ser adicionados, removidos ou alterados em Gestão → Configurações; o tamanho escolhido também aparece no resumo e na mensagem do WhatsApp.
- Upload de imagem diretamente do dispositivo, com redimensionamento e compressão automáticos antes de salvar (arquivos de até 8 MB são aceitos).
- Área exclusiva de gestão para opções de montagem de copos personalizados.
- Personalização feita somente pelas opções cadastradas pela loja, sem campo de texto livre.
- Pergunta separada sobre colher em cada produto, com valor exibido claramente ao cliente e preço configurável na gestão.
- Remoção de itens do resumo do pedido, com atualização automática do total.
- Configuração das formas de pagamento exibidas ao cliente.
- Taxa de entrega configurável individualmente para cada faixa de 1 km a 10 km. A distância é arredondada para cima para selecionar a faixa (por exemplo, 2,3 km usa a taxa de 3 km); a taxa é somada ao subtotal e enviada discriminada na mensagem do WhatsApp.

## Sincronização com Supabase (configuração desta versão)

Esta versão já está conectada ao projeto Supabase informado pela loja. O arquivo `supabase-config.js` contém a URL e a publishable key (chave pública própria para uso no navegador). Nunca coloque neste projeto uma `service_role` key ou uma `sb_secret` key.

### Configuração inicial obrigatória no painel Supabase
1. Abra o projeto Supabase e entre em **SQL Editor**.
2. Abra o arquivo `supabase-setup.sql` que acompanha este ZIP, copie todo o conteúdo e execute-o no SQL Editor. Ele cria a tabela `public.store_state`, as políticas RLS e habilita Realtime.
3. Em **Authentication → Users**, crie o usuário administrativo com o e-mail e senha que serão usados no painel da loja. Mantenha o cadastro público de usuários (sign ups) desativado; crie usuários administrativos manualmente.
4. Publique todos os arquivos desta pasta no GitHub Pages, substituindo os arquivos da versão anterior. Não publique apenas o `app.js`: publique também `index.html`, `styles.css`, `supabase-config.js`, `assets/` e os demais arquivos.
5. Abra o site publicado. No primeiro acesso, o cardápio pode continuar mostrando os dados locais deste navegador até que a carga inicial seja enviada. No computador que contém o cadastro mais atualizado, abra o ícone de gestão, entre com o usuário Supabase e vá a **Configurações → Sincronização na nuvem**. Clique em **Enviar dados locais para a nuvem**.
6. Depois da carga inicial, abra o site em outro dispositivo: ele carregará o cardápio salvo na nuvem. Alterações feitas por uma conta administrativa autenticada são enviadas automaticamente; outros dispositivos recebem as atualizações por Realtime.

### Comportamento e cuidados
- Produtos, categorias, adicionais, formas de pagamento, tamanhos, preços, imagens e configurações da loja ficam no registro JSON da tabela `store_state`. O carrinho de cada cliente continua local e não é compartilhado.
- A sincronização automática de alterações administrativas exige login Supabase. A leitura do cardápio é pública.
- O primeiro envio deve ser feito somente no dispositivo que contém os dados corretos. Não use o botão de carga inicial para sobrescrever um cardápio já existente.
- As imagens dos produtos ainda são armazenadas como dados Base64 dentro do JSON. Muitas imagens grandes podem deixar o registro pesado; numa etapa posterior, recomendamos migrá-las para Supabase Storage.
- A política SQL permite escrita a qualquer usuário autenticado. Por isso, mantenha o cadastro público desativado e crie apenas contas administrativas confiáveis. Para uma operação mais rigorosa, a próxima etapa deve restringir as políticas por papel administrativo (`app_metadata`).
- Esta é uma aplicação front-end. A verificação de raio e valores de entrega ocorre no navegador e não substitui validação no servidor antes de qualquer cobrança.
- Se uma alteração for feita simultaneamente em dois dispositivos, prevalece a última gravação recebida (última atualização vence).

## Observações
- O envio ao WhatsApp abre uma conversa com a mensagem preenchida; o cliente ainda precisa confirmar o envio no WhatsApp.
- A seleção do tipo de produto é exclusiva do painel da loja. Na página do cliente, o sistema apenas apresenta as opções pertinentes ao produto.


### Tabela de tamanhos e preços por produto

No cadastro de cada produto personalizado, a loja pode marcar **Exibir tabela de tamanhos para este produto**. Se deixar desmarcado, o cliente não verá a pergunta de tamanho e será cobrado o valor base cadastrado. Se marcar, aparecerão os tamanhos configurados em Configurações, com um campo de preço para cada tamanho. O cliente deverá escolher um deles; o preço exibido, o carrinho, o resumo e a mensagem do WhatsApp usarão o valor correspondente ao tamanho escolhido.


## Verificação da área de entrega

O checkout agora valida a localização antes de permitir o envio do pedido. O raio inicial é de 10 km, com origem configurada em latitude -16.608838 e longitude -49.308809. A loja pode alterar o raio e as coordenadas em **Painel de gestão → Configurações → Área de entrega**.

O cliente deve preencher o endereço de entrega e então escolher **Usar minha localização** (GPS do navegador) ou **Verificar endereço**. A validação por endereço consulta o serviço público Nominatim/OpenStreetMap; o texto do endereço digitado é enviado a esse serviço para encontrar coordenadas. A localização GPS depende da permissão do navegador e de contexto seguro (HTTPS ou localhost).

A distância é calculada em linha reta (fórmula de Haversine), não pelo percurso das ruas. A validação é uma barreira no front-end deste protótipo e não substitui uma validação no servidor para operação pública/produção.


## Atualizações desta versão
- Seleção individual dos tamanhos de copo permitidos em cada produto personalizado, com preço por tamanho.
- Categorias podem ser adicionadas e excluídas no painel de gestão.
- Todos os preços no cardápio passam a exibir o texto “A partir de” em verde.
- Cremes e caldas continuam separados dos acompanhamentos.
- Preço unitário da colher configurável e somado ao pedido conforme a seleção do cliente.
- Nova aba Pedidos com visualização dos pedidos do dia e histórico recente (até 300 registros).
- Para ativar o registro e histórico dos pedidos, execute `formula-acai-orders.sql` no SQL Editor do Supabase. Esse script cria apenas a tabela `orders`; não altera nem apaga `store_state`.
- Depois de executar o SQL, publique todos os arquivos do ZIP no GitHub Pages. Pedidos novos serão gravados no Supabase; os anteriores ao uso desta função não serão recuperados automaticamente.


### Colheres por produto
O cliente informa a quantidade de colheres (de 0 a 20) em cada produto. O painel de gestão configura um único preço unitário; o sistema calcula quantidade × preço unitário, apresenta o valor no carrinho e registra a quantidade e o preço no JSON do pedido. Pedidos antigos continuam compatíveis: quando não houver `spoonQty`, o campo legado `wantsSpoon` é interpretado como zero ou uma colher.


Atualização: seleção do endereço pelo mapa (Leaflet/OpenStreetMap), gravação das coordenadas no pedido e link de localização no WhatsApp. Inclui `formula-acai-orders-repair.sql`, uma migração idempotente para completar as colunas e políticas da tabela de pedidos sem alterar `store_state`. Se o salvamento do pedido falhar, a tela agora apresenta o código e a mensagem retornados pelo Supabase para facilitar o diagnóstico.
