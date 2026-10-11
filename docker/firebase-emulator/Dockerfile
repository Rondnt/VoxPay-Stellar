# Imagen propia para el Firestore/Auth Emulator Suite: no hay imagen oficial de Firebase.
# Base eclipse-temurin (Adoptium, mismo proveedor del JDK 21 ya usado en local) + Node 20 + firebase-tools.
FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g firebase-tools \
    # El binario del Firestore Emulator (.jar) no viene con firebase-tools -- se descarga de Google
    # la primera vez que corre `emulators:start`, y queda en la capa writable del CONTENEDOR, no en
    # la imagen ni en el volumen de /data. Un `docker compose restart` lo conserva (mismo contenedor),
    # pero `docker compose down` + `up` crea un contenedor nuevo y fuerza una redescarga en cada
    # arranque -- si en ese momento falla la red hacia storage.googleapis.com, el emulador entra en
    # loop de crash (visto en vivo). Se hornea acá, en el build, para no depender nunca más de la red
    # en runtime.
    && firebase setup:emulators:firestore \
    && apt-get purge -y curl gnupg \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

EXPOSE 4000 4400 4500 8080 9099 9150

CMD ["firebase", "emulators:start", "--only", "firestore,auth"]
