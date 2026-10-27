# SaintCalendar.Api

API ASP.NET Core que devolve um santo para cada dia civil do calendário atual. Ela existe para a página [Pomodoro Católico](https://catholic-pomodoro.pages.dev) mostrar o santo do dia debaixo da liturgia.

A API só lê um catálogo. Não há banco, conta, autenticação nem escrita.

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
  "image": "https://upload.wikimedia.org/(...).jpg",
  "source": {
    "name": "Wikipédia",
    "url": "https://pt.wikipedia.org/wiki/Francisco_de_Assis",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br"
  },
  "imageCredit": {
    "author": "(...)",
    "license": "Public domain",
    "url": "https://commons.wikimedia.org/wiki/File:(...)"
  }
}
```

`image` e `imageCredit` só aparecem quando há foto. `image` é sempre `https` e termina em `.jpg`, `.jpeg`, `.png` ou `.webp`.

## Camadas

```text
src/
  Api/                  controller do GET, CORS e injeção de dependência
  Domain/               entidade, regra do dia, regra da resposta e o contrato ISaintRepository
  Infrastructure.Data/  implementação do contrato sobre Calendar/saints.json
  Tests.Unit/           regra do dia, regra da resposta, catálogo e endpoint
tools/
  generate-calendar.mjs     gera o catálogo uma única vez
  written-biographies.json  frase escrita para esta API onde a Wikipédia não tem artigo
```

O catálogo é um JSON versionado neste repositório. Corrigir um santo é commit e deploy. Se um dia a API precisar de edição sem deploy, `Infrastructure.Data` troca para um banco e o contrato em `Domain` continua o mesmo.

## Como rodar

É preciso o SDK do .NET 10.

```bash
dotnet test src/SaintCalendar.Api.slnx
dotnet run --project src/Api
```

A API sobe em `http://localhost:5080`. Exemplo: `http://localhost:5080/santo-do-dia/10-04`.

## Como o catálogo nasce

O pedido do dia não consulta nenhuma fonte externa. O catálogo é gerado uma vez, revisado e commitado:

```bash
node tools/generate-calendar.mjs
```

| Dado | Origem | Licença |
| --- | --- | --- |
| Nome e dia | Wikidata, dia de festa (`P841`) | CC0 |
| Biografia curta | Primeira frase do artigo na Wikipédia em português | CC BY-SA 4.0 |
| Biografia de `02-29` | Frase escrita para esta API, em `tools/written-biographies.json` | Da API |
| Foto | Wikimedia Commons, só domínio público, CC0, CC BY ou CC BY-SA | A do arquivo, gravada junto do dia |

Quem entra:

- Pessoa com status de santo na Wikidata (santo, santo católico, santo canonizado ou santo pré-congregação), ou com a festa marcada como Calendário Romano Geral.
- Fica de fora a data com fim (`P582`), a marcada como calendário tridentino, de 1960 ou ortodoxo, e a de outra religião que não a Igreja Católica ou o cristianismo ocidental.
- Quem tem uma data marcada como Calendário Romano Geral conta só nessa data.
- Festa móvel não vira dia: só entra o que a Wikidata traz como mês e dia.

Vários santos no mesmo dia, nesta ordem:

1. Só quem tem artigo na Wikipédia em português.
2. Quem tem a festa marcada como Calendário Romano Geral.
3. Quem tem foto com licença de reuso.
4. Quem tem status católico explícito.
5. Quem tem mais artigos em outras Wikipédias.

Cada santo aparece num dia só. Quando o mesmo santo vence em mais de um dia, ele fica no dia do Calendário Romano Geral; sem essa marca, no dia com menos alternativas, e os outros dias passam ao próximo candidato.

A biografia é a primeira frase da introdução do artigo. Notas de idioma entre parênteses (grego, latim, siríaco, romanização) saem; quando isso muda o texto, a fonte passa a dizer "Wikipédia, trecho adaptado". Dia sem biografia não entra no catálogo. A API não inventa o texto que falta.
