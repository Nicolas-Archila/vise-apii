# frontend/Dockerfile
FROM nginx:alpine
# Reemplazamos el sitio por defecto con nuestra configuración
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Servimos el index
COPY index.html /usr/share/nginx/html/index.html
