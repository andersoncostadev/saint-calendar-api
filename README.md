# SaintCalendar.Api

API ASP.NET Core que devolve um santo para cada dia civil do calendário atual. Ela existe para a página [Pomodoro Católico](https://catholic-pomodoro.pages.dev) mostrar o santo do dia debaixo da liturgia.

A API só lê um catálogo. Não há banco, conta, autenticação nem escrita. Por isso ela não precisa de servidor em produção: o mesmo código exporta um arquivo por dia, e o GitHub Pages serve esses arquivos no mesmo caminho do `GET`.

O santo de cada dia é o que a [Canção Nova](https://santo.cancaonova.com) celebra, porque ela segue o Martirológio Romano. Da Canção Nova vem só qual santo é celebrado em cada dia; nenhum texto, oração ou foto dela entra no catálogo.

## Contrato

```
GET /santo-do-dia/{mm}-{dd}
```

O mês e o dia vêm em dois dígitos. `02-29` existe. A resposta traz `access-control-allow-origin: *`.

| Status | Quando |
| --- | --- |
| 200 | O dia está no catálogo com título e biografia |
| 404 | Dia fora de `01-01` a `12-31`, dia que não existe (`02-30`) ou dia sem biografia no catálogo |

Corpo do 200:

```json
{
  "title": "Francisco de Assis",
  "biography": "São Francisco de Assis (...) foi um frade católico (...).",
  "summary": [
    "São Francisco de Assis (...) foi um frade católico (...). Depois de uma juventude irrequieta (...).",
    "(...)"
  ],
  "image": "https://upload.wikimedia.org/(...).jpg",
  "source": {
    "name": "Wikipédia",
    "url": "https://pt.wikipedia.org/wiki/Francisco_de_Assis",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br"
  },
  "imageCredit": {
    "author": "(...)",
    "license": "Domínio público",
    "url": "https://commons.wikimedia.org/wiki/File:(...)"
  },
  "calendar": {
    "name": "Canção Nova, Santo do Dia",
    "url": "https://santo.cancaonova.com/santo/(...)/"
  },
  "life": {
    "birth": "24 de junho de 1182, Assis",
    "death": "3 de outubro de 1226, Porciúncula",
    "burial": "Basílica de São Francisco de Assis",
    "order": "Ordem dos Frades Menores"
  },
  "veneration": {
    "veneratedBy": "Igreja Católica, Igreja Anglicana",
    "beatification": "(...)",
    "canonization": "16 de julho de 1228",
    "canonizedBy": "Papa (...)",
    "feast": "4 de outubro",
    "patronOf": "Animais; ecologia",
    "attributes": "(...)"
  },
  "factsSource": {
    "name": "Wikidata",
    "url": "https://www.wikidata.org/wiki/Q676555",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/deed.pt-br"
  }
}
```

`image` e `imageCredit` só aparecem quando há foto. `image` é sempre `https` e termina em `.jpg`, `.jpeg`, `.png` ou `.webp`.

`summary` é a introdução do artigo da Wikipédia, em parágrafos: no máximo 3 e 1.200 caracteres somados, cortada no fim de uma frase. O primeiro parágrafo começa pela `biography`, que continua obrigatória. Parágrafo sem texto não aparece, e a lista some quando fica vazia. Dia com biografia escrita para a API (`tools/written-biographies.json`) não tem `summary`. Sem item da Wikidata, esse dia também sai sem `source`: ficam o título, a biografia e a linha `calendar`.

Em `life` e `veneration`, campo sem texto não aparece, e o bloco inteiro some quando fica vazio. `veneration.feast` existe em todo dia do catálogo. `factsSource` nomeia o item da Wikidata de onde vêm as datas e os locais. `calendar` aparece quando o santo do dia é o da Canção Nova e aponta para a página dela.

`summary`, `life.burial`, `life.order`, `veneration.beatification`, `veneration.canonizedBy` e `veneration.attributes` foram acrescentados depois do contrato inicial. Nenhum campo anterior mudou de nome, tipo ou regra: quem lê só os campos antigos continua lendo a resposta, e quem lê os novos precisa tratar a ausência deles.

## Camadas

```text
src/
  Api/                  controller do GET, CORS, injeção de dependência e exportação estática
  Domain/               entidade, regra do dia, regra da resposta e o contrato ISaintRepository
  Infrastructure.Data/  implementação do contrato sobre Calendar/saints.json
  Tests.Unit/           regra do dia, regra da resposta, catálogo, endpoint e exportação
tools/
  read-cancaonova-calendar.mjs lê qual santo a Canção Nova celebra em cada dia (nome, dia e URL)
  cancaonova-calendar.json     o que a leitura acima gravou
  cancaonova-titles.json       opcional: dia → artigo da Wikipédia, quando o nome não é achado sozinho
  generate-calendar.mjs        gera o catálogo; guarda a consulta da Wikidata em wikidata-feasts.json (fora do git)
                               e a reusa quando o serviço de consultas não responde
  enrich-summary.mjs           acrescenta a introdução do artigo (summary) a cada dia do catálogo
  enrich-life-veneration.mjs   acrescenta vida e veneração a cada dia do catálogo
  intro-text.mjs               frase e nota de idioma, a mesma regra para a biografia e a introdução
  wikimedia.mjs                pedido às APIs da Wikimedia, com pausa e nova tentativa
  written-biographies.json     frase escrita para esta API onde a Wikipédia não tem artigo
  calendar-rules.mjs           título, crédito da foto, pontuação e o que conta como celebração móvel
  fact-overrides.json          “Na arte”: recusa ou troca o texto da infobox quando ele não é símbolo
.github/workflows/pages.yml    testa, exporta e publica no GitHub Pages a cada push na main
```

O catálogo é um JSON versionado neste repositório. Corrigir um santo é commit e deploy. Se um dia a API precisar de edição sem deploy, `Infrastructure.Data` troca para um banco e o contrato em `Domain` continua o mesmo.

## Como rodar

É preciso o SDK do .NET 10.

```bash
dotnet test src/SaintCalendar.Api.slnx
dotnet run --project src/Api
```

A API sobe em `http://localhost:5080`. Exemplo: `http://localhost:5080/santo-do-dia/10-04`.

## Publicação no GitHub Pages

```bash
dotnet run --project src/Api -- export "$PWD/site"
```

O caminho precisa ser absoluto, porque o `dotnet run` roda a partir de `src/Api`. O comando aplica a mesma regra do `GET` a cada um dos 366 dias e grava `site/santo-do-dia/{mm}-{dd}`, sem extensão, mais `site/.nojekyll`. Dia que daria 404 na API não vira arquivo, e o Pages responde 404 do mesmo jeito. Um teste compara cada arquivo com a resposta do endpoint.

O workflow `.github/workflows/pages.yml` faz isso a cada push na `main` e publica a pasta. Para ligar: no repositório do GitHub, **Settings → Pages → Source: GitHub Actions**. O repositório precisa ser público no plano gratuito.

O Pages responde com `access-control-allow-origin: *`. Na página, `VITE_SAINT_API_URL` passa a ser o endereço do Pages, por exemplo `https://<usuario>.github.io/<repositorio>`, e o pedido continua `GET {VITE_SAINT_API_URL}/santo-do-dia/{mm}-{dd}`.

## Como o catálogo nasce

O pedido do dia não consulta nenhuma fonte externa. O catálogo é gerado uma vez, revisado e commitado, nesta ordem:

```bash
node tools/read-cancaonova-calendar.mjs
node tools/generate-calendar.mjs
node tools/enrich-summary.mjs
node tools/enrich-life-veneration.mjs
```

Os dois últimos rodam sobre o catálogo já commitado e não trocam santo de dia.

| Dado | Origem | Licença |
| --- | --- | --- |
| Qual santo em cada dia | Canção Nova, Santo do Dia: só o nome, o dia e a URL da página | — |
| Dia sem Canção Nova | Wikidata, dia de festa (`P841`), só santo católico ou do Calendário Romano Geral | CC0 |
| Biografia curta | Primeira frase do artigo na Wikipédia em português | CC BY-SA 4.0 |
| Biografia escrita | Frase própria em `tools/written-biographies.json`, a partir de fatos CC0 da Wikidata, quando não há artigo em português | Da API; a fonte nomeia o item quando ele existe |
| Introdução (`summary`) | Introdução do mesmo artigo da biografia (`prop=extracts`, `exintro`, `explaintext`) | CC BY-SA 4.0 |
| Foto | Wikimedia Commons, só domínio público, CC0, CC BY ou CC BY-SA | A do arquivo, gravada junto do dia |
| Nascimento e morte | Wikidata: data (`P569`, `P570`) com a precisão gravada, “c.” quando marcada como aproximada, e local (`P19`, `P20`) | CC0 |
| Venerado por, canonização e padroeiro | Infobox do artigo na Wikipédia em português (`venerado_em`, `data_canonização`, `patrono`) | CC BY-SA 4.0 |
| Venerado por e canonização, sem infobox | Wikidata: religião do dia de festa e status canônico (`P411`) com a data. Canonização anterior a 993 ou à morte é descartada; sem data, santo pré-congregação vira “Pré-congregação” | CC0 |
| Festa | O próprio dia do catálogo | — |
| Sepultura e ordem religiosa | Wikidata: local de sepultamento (`P119`) e ordem religiosa (`P611`) | CC0 |
| Beatificação e atributos na arte | Infobox (`data_beatificação`, `atribuições`); sem ela, Wikidata: data do status de beato em `P411` e símbolo iconográfico (`P4185`) | CC BY-SA 4.0 na infobox; CC0 na Wikidata |
| Canonizado por | Wikidata: qualificador "conferido por" (`P1027`) da declaração de santo em `P411`, só quando é um papa | CC0 |

O padroado só vem da infobox: na Wikidata (`P2925`) ele mistura lugar, táxon e ofício sem curadoria. Em "venerado por" ficam só igrejas e comunhões cristãs.

Na Wikidata vale a declaração preferida antes das normais, e a depreciada fica de fora. O rótulo é o de `pt-br` ou `pt`; rótulo em inglês ou só com o id (`Q…`) sai. Beatificação anterior à morte ou a 993 sai, como a canonização. Texto com mais de 160 caracteres é cortado na última vírgula; sem vírgula depois dos 20 primeiros caracteres, o campo sai.

Santo da Canção Nova:

- Vale a primeira entrada do dia que tiver artigo aceito. Sem artigo em nenhuma, vale a primeira, com a biografia escrita. Celebração móvel não fixa o dia: Sagrado Coração de Jesus, Imaculado Coração de Maria, Cristo Rei, Batismo do Senhor, Sagrada Família, Santíssima Trindade, Corpus Christi, Pentecostes, Ascensão e Páscoa. Só entra a entrada cujo nome começa por essa celebração.
- O nome publicado lá é ligado ao artigo da Wikipédia em português e ao item da Wikidata. A busca tenta o nome, o nome sem "São", "Santa" ou "Beato", e por fim a busca da Wikipédia com o título inteiro.
- O artigo só é aceito se tiver o primeiro nome e pelo menos 60% dos nomes do santo. Pessoa precisa ter status de santo ou beato na Wikidata, ou festa (`P841`) nesse dia. Item que não é pessoa só entra se o tipo (`P31`) for religioso: título de Maria, festividade, episódio do Evangelho, dogma, solenidade, grupo, dupla, personagem bíblico, anjo ou arcanjo. Grupo, dupla ou personagem bíblico sem festa no dia precisa de título manual.
- Entre artigos aceitos, ganha o que tem a festa no mesmo dia na Wikidata. O dia da Canção Nova prevalece sobre o mesmo item escolhido só pela Wikidata. No dia com dois santos, a biografia é a do primeiro e o título é o da Canção Nova.
- Nome que não é achado sozinho, ou que a regra recusaria mesmo estando certo, fica em `tools/cancaonova-titles.json`: string é o artigo, e o título sai do nome da Canção Nova; objeto `{ article, title }` fixa os dois.
- O título da Canção Nova perde o aposto depois de vírgula, dois-pontos, travessão ou verbo. "Papa" não fica entre o honorífico e o nome. "San" no começo vira "São". Celebração não ganha honorífico.
- No crédito da foto, autor desconhecido em qualquer forma vira "Autor desconhecido", nome repetido sai, e o texto fica em até 80 caracteres. "Public domain" vira "Domínio público".
- `tools/fact-overrides.json` troca ou recusa "Na arte" quando a infobox ainda traz o texto indicado em `if`. `null` tira a infobox e deixa o símbolo da Wikidata, se houver.

Dia sem Canção Nova, ou com nome que não foi ligado:

- Pessoa com status de santo católico na Wikidata (santo católico, santo canonizado ou santo pré-congregação), ou com a festa marcada como Calendário Romano Geral. O status genérico "santo" sozinho não basta, porque também marca santos só das igrejas ortodoxas.
- Fica de fora a data com fim (`P582`), a marcada como calendário tridentino, de 1960 ou ortodoxo, e a de outra religião que não a Igreja Católica ou o cristianismo ocidental.
- Quem tem uma data marcada como Calendário Romano Geral conta só nessa data.
- Festa móvel não vira dia: só entra o que a Wikidata traz como mês e dia.

Vários santos no mesmo dia sem Canção Nova, nesta ordem:

1. Só quem tem artigo na Wikipédia em português.
2. Quem tem a festa marcada como Calendário Romano Geral.
3. Quem tem foto com licença de reuso.
4. Quem tem status católico explícito.
5. Quem tem mais artigos em outras Wikipédias.

Cada santo aparece num dia só. Quando o mesmo santo vence em mais de um dia, ele fica no dia do Calendário Romano Geral; sem essa marca, no dia com menos alternativas, e os outros dias passam ao próximo candidato.

A biografia é a primeira frase da introdução do artigo. Notas de idioma entre parênteses (grego, latim, siríaco, romanização) saem; quando isso muda o texto, a fonte passa a dizer "Wikipédia, trecho adaptado". Dia sem biografia não entra no catálogo. A API não inventa o texto que falta.

A introdução segue a mesma regra de notas de idioma e de fonte adaptada. Ela só entra quando o primeiro parágrafo começa pela biografia. Parágrafo com sobra de wikitexto, chave, colchete ou palavra colada é inválido: se for o primeiro, o dia fica sem `summary`; depois dele, a introdução para ali.
