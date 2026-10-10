# Imagen propia para el Firestore/Auth Emulator Suite: no hay imagen oficial de Firebase.
# Base eclipse-temurin (Adoptium, mismo proveedor del JDK 21 ya usado en local) + Node 20 + firebase-tools.
FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g firebase-tools \
    && apt-get purge -y curl gnupg \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

EXPOSE 4000 4400 4500 8080 9099 9150

CMD ["firebase", "emulators:start", "--only", "firestore,auth"]
