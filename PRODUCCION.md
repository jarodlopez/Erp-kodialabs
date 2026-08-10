# Puesta en producción como SaaS

Guía práctica para operar la plataforma cobrando una **suscripción mensual con
validación manual de pago** (sin pasarela). Cubre las suscripciones, el panel
de súper-admin y el endurecimiento recomendado.

## 1. Variables de entorno (Vercel)

Además de las obligatorias de Firebase (`FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`, `CRON_SECRET`):

| Variable | Para qué |
| --- | --- |
| `SUPER_ADMIN_EMAILS` | Correos (separados por coma) que pueden entrar a `/admin`. |
| `SUBSCRIPTION_PAYMENT_INFO` | Datos bancarios que verá el comercio en `/suscripcion`. |

## 2. Cómo funciona la suscripción

- Al registrarse, cada comercio obtiene **14 días de prueba** automáticamente.
- Cuando la prueba o el periodo pagado vence, la app **bloquea** el acceso y
  redirige a `/suscripcion`, donde el comercio ve las instrucciones de pago y
  puede **reportar un pago** (transferencia/depósito).
- El **súper-admin** entra a `/admin`, revisa los pagos reportados y **aprueba**
  (extiende la suscripción según el plan) o **rechaza**. También puede
  **extender**, **suspender** o **reactivar** cualquier comercio manualmente.
- El súper-admin nunca se bloquea por suscripción.

Los planes se definen en `src/lib/subscription.ts` (`PLANS`): nombre, meses que
otorga y precio de referencia. Ajusta ahí montos y duraciones.

## 3. Endurecimiento (checklist)

### 3.1 Reglas de seguridad de Firestore
Ya están escritas (`firestore.rules`) con cierre *default-deny* y aislamiento
por organización. **Despliégalas** (una vez, desde una computadora con acceso
de Owner/Editor al proyecto Firebase):

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <tu-proyecto>
```

### 3.2 Respaldos (backups)
En Firebase Console → Firestore → **Backups**: activa respaldos programados
(diarios) y, si el plan lo permite, **Point-in-Time Recovery (PITR)**.

### 3.3 Monitoreo de errores
Integra un servicio como **Sentry** (o al menos revisa los *Runtime Logs* de
Vercel). Configura alertas para respuestas 5xx.

### 3.4 Storage (imágenes)
Si vas a usar imágenes de productos/logos, habilita **Firebase Storage** en la
consola y despliega `storage.rules`.

### 3.5 Costos
Firestore y Vercel cobran por uso. Estima el costo por comercio activo y fija
el precio de la suscripción por encima de ese costo con margen.

### 3.6 Legal
Publica **Términos de servicio** y **Aviso de privacidad**, y ten en cuenta tu
propia facturación fiscal por el cobro de la suscripción.

## 4. Pendientes opcionales (mejoras futuras)

- Correos automáticos (aviso de vencimiento próximo, confirmación de pago).
- Recordatorio automático al comercio X días antes de vencer.
- Límites por plan (p. ej. número de usuarios o productos).
- Portal de súper-admin con métricas (ingresos, comercios activos, morosos).
