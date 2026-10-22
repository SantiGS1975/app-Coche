# Gastos del coche

App web instalable (PWA) para controlar los gastos de tu coche. Haces una foto a un ticket de gasolina o a una factura de taller y la app extrae fecha, comercio, litros, importes y kilómetros. Antes de guardar puedes corregir todo.

- Funciona en móvil y en ordenador, y se instala con su icono como una app.
- Sin servidor ni cuentas: los gastos se guardan en el propio dispositivo (hay copia de seguridad en JSON y exportación a CSV).
- Resumen del mes y del año, gasto por mes y por categoría, coste por 100 km, consumo medio y precio del último repostaje.

## Publicarla en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `gastos-coche`) y sube **todo el contenido de esta carpeta** a la rama `main`, de modo que `index.html` quede en la raíz del repositorio.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guarda.
3. En uno o dos minutos la app estará en `https://TU-USUARIO.github.io/gastos-coche/`.

## Instalarla como app

- **Android (Chrome):** abre la dirección, y en el aviso «Instalar app» o en el menú ⋮ → *Instalar aplicación*.
- **iPhone / iPad (Safari):** botón Compartir → *Añadir a pantalla de inicio*.
- **Ordenador (Chrome / Edge):** icono de instalar en la barra de direcciones.

La app solo se puede instalar desde una dirección `https://` (GitHub Pages ya lo es) o desde `localhost`.

## Cómo lee los tickets

1. **Lector local (por defecto, gratis).** Usa [Tesseract.js](https://github.com/naptha/tesseract.js) (OCR) dentro del navegador, con el idioma español. La foto no sale del dispositivo. La primera vez descarga el lector (unos MB) y necesita conexión; después queda en caché. Funciona mejor con fotos nítidas, bien iluminadas y con el ticket plano. Las facturas largas o con tablas complicadas suelen salir regular: revisa siempre la pantalla de comprobación.
2. **Lectura con Claude (opcional).** En *Ajustes* puedes pegar una clave de la API de Anthropic (se crea en <https://console.anthropic.com>). Entonces la foto se envía a la API y la lectura es bastante más fiable, sobre todo en facturas. Se paga por uso (céntimos por ticket). La clave se guarda solo en tu dispositivo, en el almacenamiento del navegador, y las llamadas van directas del navegador a Anthropic. Úsalo solo en tus propios dispositivos y no compartas tu copia de la app con la clave puesta.

## Tus datos

Se guardan en el almacenamiento local del navegador (`localStorage`), separado por dirección web. Si borras los datos del sitio, desinstalas la app o cambias de dispositivo, se pierden: usa **Ajustes → Guardar copia (JSON)** de vez en cuando y **Restaurar copia** para pasarlos a otro dispositivo.

## Desarrollo

No hay compilación ni dependencias. Para probar en local:

```
python3 -m http.server 8000
# abre http://localhost:8000
node tests/parser.test.js   # pruebas del lector de texto de tickets
```

Estructura:

- `index.html`: la app completa en un solo archivo (estilos y código incluidos). Es lo único imprescindible; el resto añade icono e instalación.
- `src/`: código fuente por separado (`styles.css`, `js/app.js`, `js/ocr.js`, `js/parser.js`). Tras cambiarlo, ejecuta `python3 build.py` para regenerar `index.html`.
- `sw.js`, `manifest.webmanifest`, `icons/`: instalación y modo sin conexión. Cuando cambies archivos de la app, sube el número `VERSION` de `sw.js` para que los dispositivos se actualicen.
