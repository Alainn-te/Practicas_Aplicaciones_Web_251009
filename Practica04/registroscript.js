/* =====================================================================
   MecaGest – registroscript.js
   Toda la lógica de la página vive aquí (sin JS en línea en el HTML).

   Índice
     0. Configuración, utilidades y sonido
     1. Menú de navegación (pestañas)
     2. Registro de nuevos usuarios (por pasos, con QR de WhatsApp)
     3. Mis Citas (filtro por mes / semana)
     4. Agendar Cita
     5. Herramientas (solicitud y tabla de la orden de servicio)
     6. Mi Cuenta (foto de perfil y datos fiscales)
     7. Ajustes (colores y volumen)
     8. Formulario contenedor (evita recargas accidentales)
     9. Arranque
   ===================================================================== */

(function () {
  'use strict';

  /* ===================================================================
     0. CONFIGURACIÓN, UTILIDADES Y SONIDO
     =================================================================== */

  // Valores que puedes ajustar sin tocar el resto del código.
  const CONFIG = {
    sonidosActivos: true,   // false = la página nunca emite sonidos
    usuarioMin: 4,          // longitud mínima del nombre de usuario
    usuarioMax: 20,         // longitud máxima del nombre de usuario
    passwordMin: 8,         // longitud mínima de la contraseña
    fotoMaxMB: 2,           // tamaño máximo de la foto de perfil
    constanciaMaxMB: 5,     // tamaño máximo de la constancia fiscal (PDF)
    qrMaxMB: 1,             // tamaño máximo de la imagen del QR de WhatsApp
    redesMinimas: 0         // redes sociales que se deben elegir (0 = opcionales)
  };

  // Claves usadas en localStorage (el navegador del usuario).
  const CLAVES = {
    ajustes: 'mecagest_ajustes',
    solicitudes: 'mecagest_solicitudes',
    cuenta: 'mecagest_cuenta',
    foto: 'mecagest_foto',
    herramientas: 'mecagest_herramientas',
    citasAgendadas: 'mecagest_citas_agendadas'
  };

  // Atajos para seleccionar elementos.
  const $ = (selector, contexto = document) => contexto.querySelector(selector);
  const $$ = (selector, contexto = document) => Array.from(contexto.querySelectorAll(selector));

  // Quita acentos y pasa a minúsculas: "Dinamométrica" -> "dinamometrica".
  const normalizar = (texto) =>
    String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const pad2 = (n) => String(n).padStart(2, '0');
  const aFechaISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const aFechaHoraISO = (d) => `${aFechaISO(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  // Lectura / escritura segura en localStorage (no truena si está bloqueado).
  const Almacen = {
    leer(clave, porDefecto) {
      try {
        const valor = localStorage.getItem(clave);
        return valor === null ? porDefecto : JSON.parse(valor);
      } catch (e) {
        return porDefecto;
      }
    },
    guardar(clave, valor) {
      try {
        localStorage.setItem(clave, JSON.stringify(valor));
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  // Sonidos de interfaz generados con Web Audio (no necesita archivos).
  // Respetan el volumen y el botón "Silenciar" de la sección Ajustes.
  const Sonido = {
    volumen: 50, // 0 - 100
    contexto: null,
    tocar(tipo) {
      if (!CONFIG.sonidosActivos || this.volumen <= 0) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.contexto = this.contexto || new AC();
        if (this.contexto.state === 'suspended') this.contexto.resume();
        const melodias = { click: [660], ok: [660, 880], error: [220, 180] };
        const notas = melodias[tipo] || melodias.click;
        const t0 = this.contexto.currentTime;
        const nivel = Math.max((this.volumen / 100) * 0.25, 0.0002);
        notas.forEach((frecuencia, i) => {
          const osc = this.contexto.createOscillator();
          const ganancia = this.contexto.createGain();
          const inicio = t0 + i * 0.09;
          osc.type = 'sine';
          osc.frequency.value = frecuencia;
          ganancia.gain.setValueAtTime(0.0001, inicio);
          ganancia.gain.exponentialRampToValueAtTime(nivel, inicio + 0.01);
          ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.09);
          osc.connect(ganancia);
          ganancia.connect(this.contexto.destination);
          osc.start(inicio);
          osc.stop(inicio + 0.1);
        });
      } catch (e) {
        /* Si el navegador no permite audio, simplemente no suena. */
      }
    },
    // Aplica el volumen también a cualquier <audio> o <video> que agregues después.
    aplicarAMedios() {
      $$('audio, video').forEach((medio) => {
        medio.volume = this.volumen / 100;
      });
    }
  };

  // Mensaje al usuario con sonido (ok | error | click).
  function avisar(mensaje, tipo) {
    Sonido.tocar(tipo || 'click');
    window.alert(mensaje);
  }

  /* ===================================================================
     1. MENÚ DE NAVEGACIÓN
     El cambio de sección lo hace tu CSS (radio + label). Aquí solo se
     mejora la experiencia: centra el botón activo en pantallas pequeñas,
     sube al inicio de la sección y emite un sonido suave.
     =================================================================== */
  function iniciarMenu() {
    const radios = $$('input.tab-radio');
    const contenedor = $('.menu-inner');
    const menu = $('.menu');
    const principal = $('main');

    radios.forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;

        // Centrar el botón activo dentro de la barra horizontal del menú.
        const boton = $(`.menu label[for="${radio.id}"]`);
        if (boton && contenedor && typeof contenedor.scrollTo === 'function') {
          const izquierda =
            boton.getBoundingClientRect().left -
            contenedor.getBoundingClientRect().left +
            contenedor.scrollLeft -
            (contenedor.clientWidth - boton.offsetWidth) / 2;
          contenedor.scrollTo({ left: Math.max(0, izquierda), behavior: 'smooth' });
        }

        // Si la página está más abajo del inicio de la sección, subir.
        if (principal && menu) {
          const destino = principal.getBoundingClientRect().top + window.scrollY - menu.offsetHeight;
          if (window.scrollY > destino) {
            window.scrollTo({ top: Math.max(0, destino), behavior: 'smooth' });
          }
        }

        Sonido.tocar('click');
      });
    });
  }

  /* ===================================================================
     2. REGISTRO DE NUEVOS USUARIOS  (#registro)
     =================================================================== */
  function iniciarRegistro() {
    const form = $('#registro');
    if (!form) return;

    const campo = (id) => document.getElementById(id);
    const nombre = campo('nombre');
    const apPaterno = campo('apPaterno');
    const apMaterno = campo('apMaterno');
    const titulo = campo('tituloCortesia');
    const genero = campo('genero');
    const fechaNac = campo('fechaNacimiento');
    const edad = campo('edad');
    const email = campo('email');
    const tel = campo('numeroTelefonico');
    const horaIni = campo('horarioContactoInicio');
    const horaFin = campo('horarioContactoFin');
    const usuario = campo('usuario');
    const pass = campo('contraseña');
    const pass2 = campo('confirmarContraseña');
    const direccion = campo('direccion');
    const pais = campo('pais');
    const estado = campo('estado');
    const ciudad = campo('ciudad');
    const cp = campo('codigoPostal');
    const terminos = $('input[type="checkbox"][value="validado"]', form);
    const botonEnviar = $('input[type="submit"]', form);

    // setCustomValidity: mensaje vacío = campo válido. El navegador muestra
    // el mensaje con su burbuja nativa.
    const marcar = (el, mensaje) => el.setCustomValidity(mensaje || '');

    /* ---------- Pasos del formulario ----------
       Cada <fieldset> es un paso con su botón "Siguiente" (.btn-siguiente). */
    const fieldsets = $$('fieldset', form);
    const botonesSiguiente = fieldsets.map((fs) => $('.btn-siguiente', fs));
    let paso = 0;          // índice del paso activo
    let terminado = false; // true cuando el último paso se validó

    /* ---------- Redes sociales con URL (Facebook y LinkedIn) ----------
       La URL solo se habilita si se marca la casilla; al desmarcar se borra. */
    const redesUrl = [
      { nombre: 'Facebook', casilla: campo('chkFacebook'), url: campo('urlFacebook'), dominio: /(^|\.)(facebook|fb)\.com$/i, texto: 'facebook.com' },
      { nombre: 'LinkedIn', casilla: campo('chkLinkedin'), url: campo('urlLinkedin'), dominio: /(^|\.)linkedin\.com$/i, texto: 'linkedin.com' }
    ].filter((r) => r.casilla && r.url);

    function validarRed(red) {
      const valor = red.url.value.trim();
      let mensaje = '';
      if (red.casilla.checked && !valor) {
        mensaje = `Escribe la URL de tu ${red.nombre} o desmarca la casilla.`;
      } else if (valor) {
        try {
          const u = new URL(valor);
          if (!/^https?:$/.test(u.protocol) || !red.dominio.test(u.hostname)) {
            mensaje = `La URL debe pertenecer a ${red.texto}.`;
          }
        } catch (e) {
          mensaje = 'Escribe la URL completa, por ejemplo https://' + red.texto + '/usuario';
        }
      }
      marcar(red.url, mensaje);
    }

    redesUrl.forEach((red) => {
      red.url.disabled = !red.casilla.checked;
      red.casilla.addEventListener('change', () => {
        if (red.casilla.checked) {
          red.url.disabled = false;
          red.url.focus();
        } else {
          red.url.value = '';
          red.url.disabled = true;
        }
        validarRed(red);
        validarRedesMinimas();
      });
      red.url.addEventListener('input', () => validarRed(red));
    });

    /* ---------- WhatsApp: se sube la imagen del código QR ----------
       Solo acepta imágenes reales; si el archivo no lo es, se rechaza, se
       vacía el campo y no deja avanzar. */
    const chkWa = campo('chkWhatsapp');
    const qrInput = campo('qrWhatsapp');
    const qrVista = campo('previewQrWhatsapp');
    const qrAyuda = campo('ayudaQrWhatsapp');
    const hayWhatsapp = !!(chkWa && qrInput && qrVista && qrAyuda);
    const TEXTO_AYUDA_QR = qrAyuda ? qrAyuda.textContent : '';
    let qrDatos = null;  // imagen válida (data URL)
    let qrError = '';    // último motivo de rechazo
    let qrToken = 0;     // evita que una lectura vieja pise a una nueva

    function mostrarAyudaQr(mensaje, esError) {
      qrAyuda.textContent = mensaje || TEXTO_AYUDA_QR;
      qrAyuda.classList.toggle('error', !!esError);
    }
    function limpiarQr() {
      qrToken++;
      qrDatos = null;
      qrError = '';
      qrInput.value = '';
      qrVista.hidden = true;
      qrVista.removeAttribute('src');
      mostrarAyudaQr('', false);
    }
    function validarWhatsapp() {
      if (!hayWhatsapp) return;
      let mensaje = '';
      if (chkWa.checked) {
        if (qrError) mensaje = qrError;
        else if (!qrDatos) mensaje = 'Sube la imagen del código QR de tu WhatsApp (solo imágenes).';
      }
      marcar(qrInput, mensaje);
    }
    function rechazarQr(mensaje) {
      limpiarQr();
      qrError = mensaje;
      mostrarAyudaQr(mensaje, true);
      validarWhatsapp();
      avisar(mensaje, 'error');
    }

    if (hayWhatsapp) {
      qrInput.disabled = !chkWa.checked;

      chkWa.addEventListener('change', () => {
        if (chkWa.checked) {
          qrInput.disabled = false;
          qrInput.focus();
        } else {
          limpiarQr();
          qrInput.disabled = true;
        }
        validarWhatsapp();
        validarRedesMinimas();
      });

      qrInput.addEventListener('change', () => {
        const archivo = qrInput.files[0];
        const token = ++qrToken;
        qrDatos = null;
        qrError = '';
        qrVista.hidden = true;
        mostrarAyudaQr('', false);

        if (!archivo) {
          validarWhatsapp();
          return;
        }
        if (!/^image\//.test(archivo.type)) {
          return rechazarQr('Solo se permiten imágenes (JPG, PNG, WEBP…). El archivo elegido no es una imagen.');
        }
        if (archivo.size > CONFIG.qrMaxMB * 1048576) {
          return rechazarQr(`La imagen no debe pesar más de ${CONFIG.qrMaxMB} MB. Solo se permiten imágenes.`);
        }

        const lector = new FileReader();
        lector.onerror = () => {
          if (token === qrToken) rechazarQr('No se pudo leer el archivo. Solo se permiten imágenes.');
        };
        lector.onload = () => {
          if (token !== qrToken) return;
          // Comprueba que el navegador realmente pueda abrirla como imagen.
          const prueba = new Image();
          prueba.onload = () => {
            if (token !== qrToken) return;
            qrDatos = lector.result;
            qrVista.src = qrDatos;
            qrVista.hidden = false;
            validarWhatsapp();
          };
          prueba.onerror = () => {
            if (token !== qrToken) return;
            rechazarQr('El archivo no es una imagen válida. Solo se permiten imágenes.');
          };
          prueba.src = lector.result;
        };
        lector.readAsDataURL(archivo);
      });
    }

    // Mínimo de redes sociales exigido (CONFIG.redesMinimas, 0 = opcionales).
    function validarRedesMinimas() {
      const ancla = redesUrl[0] ? redesUrl[0].casilla : null;
      if (!ancla) return;
      const marcadas = redesUrl.filter((r) => r.casilla.checked).length + (hayWhatsapp && chkWa.checked ? 1 : 0);
      marcar(ancla, CONFIG.redesMinimas && marcadas < CONFIG.redesMinimas
        ? `Selecciona al menos ${CONFIG.redesMinimas} red(es) social(es).` : '');
    }

    // Deja las redes coherentes con sus casillas (se usa tras "Limpiar").
    function sincronizarRedes() {
      redesUrl.forEach((r) => { r.url.disabled = !r.casilla.checked; });
      if (hayWhatsapp) {
        if (!chkWa.checked) limpiarQr();
        qrInput.disabled = !chkWa.checked;
      }
    }

    /* ---------- Nombre, apellidos, país, estado y ciudad ---------- */
    const REGEX_TEXTO = /^\p{L}+(?:[ '’.-]\p{L}+)*$/u;
    function validarTexto(el, etiqueta) {
      const valor = el.value.trim();
      marcar(el, valor && !REGEX_TEXTO.test(valor) ? `${etiqueta} solo puede contener letras y espacios.` : '');
    }
    const camposTexto = [
      [nombre, 'El nombre'],
      [apPaterno, 'El apellido paterno'],
      [apMaterno, 'El apellido materno'],
      [pais, 'El país'],
      [estado, 'El estado'],
      [ciudad, 'La ciudad']
    ].filter(([el]) => el);
    camposTexto.forEach(([el, etiqueta]) => {
      el.addEventListener('input', () => validarTexto(el, etiqueta));
      el.addEventListener('blur', () => {
        el.value = el.value.trim().replace(/\s+/g, ' ');
        validarTexto(el, etiqueta);
      });
    });

    /* ---------- Fecha de nacimiento y edad automática ---------- */
    function calcularEdad(fechaISO) {
      const [a, m, d] = fechaISO.split('-').map(Number);
      const hoy = new Date();
      let anios = hoy.getFullYear() - a;
      const dm = hoy.getMonth() + 1 - m;
      if (dm < 0 || (dm === 0 && hoy.getDate() < d)) anios--;
      return anios;
    }
    let edadCalculada = null; // edad numérica válida (null si no hay o es inválida)

    // Muestra el texto en el campo "Edad"; los errores salen en rojo y en mayúsculas.
    function mostrarEdad(texto, esError) {
      edad.value = texto;
      edad.title = texto;
      edad.style.color = esError ? '#c0392b' : '';
      edad.style.fontWeight = esError ? '700' : '';
      edad.style.fontSize = esError ? '0.8rem' : '';
    }

    function actualizarEdad() {
      let mensaje = '';
      edadCalculada = null;

      if (!fechaNac.value) {
        mostrarEdad('', false);
      } else {
        const anios = calcularEdad(fechaNac.value);
        if (anios < 0) {
          // Se permite escribir una fecha futura, pero se marca como inválida.
          mensaje = 'EDAD INVÁLIDA POR SER FUTURA';
          mostrarEdad(mensaje, true);
        } else if (anios > 120) {
          mensaje = 'EDAD INVÁLIDA: REVISA LA FECHA DE NACIMIENTO';
          mostrarEdad('EDAD INVÁLIDA: REVISA LA FECHA', true);
        } else {
          edadCalculada = anios;
          const unidad = anios === 1 ? 'año' : 'años';
          const condicion = anios >= 18 ? 'Mayor de edad' : 'Menor de edad';
          mostrarEdad(`${anios} ${unidad} · ${condicion}`, false);
        }
      }
      marcar(fechaNac, mensaje);
    }
    // Sin atributo "max": el calendario deja elegir fechas futuras y se avisa en rojo.
    fechaNac.addEventListener('input', actualizarEdad);
    fechaNac.addEventListener('change', actualizarEdad);

    /* ---------- Correo ---------- */
    email.addEventListener('blur', () => {
      email.value = email.value.trim().toLowerCase();
    });

    /* ---------- Teléfono: solo dígitos y símbolos habituales ---------- */
    function validarTelefono() {
      const digitos = tel.value.replace(/\D/g, '');
      marcar(tel, tel.value && (digitos.length < 7 || digitos.length > 15)
        ? 'El teléfono debe tener entre 7 y 15 dígitos.' : '');
    }
    tel.addEventListener('input', () => {
      tel.value = tel.value.replace(/[^\d+()\s-]/g, '');
      validarTelefono();
    });

    /* ---------- Horario de contacto ---------- */
    function validarHorario() {
      let mensaje = '';
      if ((horaIni.value && !horaFin.value) || (!horaIni.value && horaFin.value)) {
        mensaje = 'Indica la hora de inicio y la hora de fin.';
      } else if (horaIni.value && horaFin.value && horaFin.value <= horaIni.value) {
        mensaje = 'La hora final debe ser posterior a la inicial.';
      }
      marcar(horaFin, mensaje);
    }
    horaIni.addEventListener('input', validarHorario);
    horaFin.addEventListener('input', validarHorario);

    /* ---------- Usuario (único entre las solicitudes guardadas) ---------- */
    function validarUsuario() {
      const valor = usuario.value.trim();
      let mensaje = '';
      if (valor) {
        if (valor.length < CONFIG.usuarioMin || valor.length > CONFIG.usuarioMax) {
          mensaje = `El usuario debe tener entre ${CONFIG.usuarioMin} y ${CONFIG.usuarioMax} caracteres.`;
        } else if (!/^[A-Za-z0-9._-]+$/.test(valor)) {
          mensaje = 'El usuario solo puede llevar letras, números, punto, guion y guion bajo.';
        } else if (Almacen.leer(CLAVES.solicitudes, []).some((s) => s.usuario.toLowerCase() === valor.toLowerCase())) {
          mensaje = 'Ese nombre de usuario ya fue solicitado. Elige otro.';
        }
      }
      marcar(usuario, mensaje);
    }
    usuario.addEventListener('input', validarUsuario);
    usuario.addEventListener('blur', () => {
      usuario.value = usuario.value.trim();
      validarUsuario();
    });

    /* ---------- Contraseña y confirmación ---------- */
    function validarConfirmacion() {
      marcar(pass2, pass2.value && pass2.value !== pass.value ? 'Las contraseñas no coinciden.' : '');
    }
    function validarPassword() {
      const valor = pass.value;
      let mensaje = '';
      if (valor) {
        if (valor.length < CONFIG.passwordMin) {
          mensaje = `La contraseña debe tener al menos ${CONFIG.passwordMin} caracteres.`;
        } else if (!/[A-Za-z]/.test(valor) || !/\d/.test(valor)) {
          mensaje = 'La contraseña debe combinar letras y números.';
        }
      }
      marcar(pass, mensaje);
      validarConfirmacion();
    }
    pass.addEventListener('input', validarPassword);
    pass2.addEventListener('input', validarConfirmacion);

    /* ---------- Código postal: 5 dígitos ---------- */
    function validarCP() {
      marcar(cp, cp.value && !/^\d{5}$/.test(cp.value) ? 'El código postal debe tener 5 dígitos.' : '');
    }
    cp.addEventListener('input', () => {
      cp.value = cp.value.replace(/\D/g, '').slice(0, 5);
      validarCP();
    });

    /* ---------- Domicilio con catálogo (domicilios.js) ----------
       Sugiere países, estados y ciudades del catálogo y completa país,
       estado y ciudad al escribir un código postal conocido. Siempre se
       puede capturar a mano: el catálogo es solo ilustrativo. */
    const catalogo = window.MECAGEST_DOMICILIOS;
    if (catalogo && pais && estado && ciudad && cp) {
      const esMexico = (valor) => normalizar(valor) === 'mexico';
      const sinPais = () => !pais.value.trim();
      const ejemplos = catalogo.ejemplosMexico || [];
      const unicos = (lista) => Array.from(new Set(lista));

      // Crea una <datalist> invisible junto al campo y la enlaza (sin tocar el HTML).
      function crearLista(id, input) {
        const lista = document.createElement('datalist');
        lista.id = id;
        input.setAttribute('list', id);
        input.setAttribute('autocomplete', 'off');
        input.insertAdjacentElement('afterend', lista);
        return lista;
      }
      function llenarLista(lista, valores) {
        lista.innerHTML = '';
        valores.forEach((valor) => {
          const opcion = document.createElement('option');
          opcion.value = valor;
          lista.appendChild(opcion);
        });
      }
      const listaPaises = crearLista('listaPaises', pais);
      const listaEstados = crearLista('listaEstados', estado);
      const listaCiudades = crearLista('listaCiudades', ciudad);

      // Estados y ciudades solo se sugieren si el país es México (o está vacío).
      function actualizarSugerencias() {
        const sugerirMexico = sinPais() || esMexico(pais.value);
        llenarLista(listaPaises, catalogo.paises);
        llenarLista(listaEstados, sugerirMexico ? catalogo.estadosMexico : []);

        const estadoNorm = normalizar(estado.value);
        const estadoConocido = catalogo.estadosMexico.some((e) => normalizar(e) === estadoNorm);
        const ciudades = ejemplos
          .filter((e) => !estadoConocido || normalizar(e.estado) === estadoNorm)
          .map((e) => e.ciudad);
        llenarLista(listaCiudades, sugerirMexico ? unicos(ciudades) : []);
      }

      // Si lo escrito coincide con el catálogo (sin importar acentos o mayúsculas),
      // se corrige a la forma oficial: "mexico" -> "México".
      function aFormaOficial(input, valores) {
        const oficial = valores.find((v) => normalizar(v) === normalizar(input.value));
        if (oficial) input.value = oficial;
      }

      // Recuerda qué campos llenó el código postal, para poder actualizarlos
      // si el usuario cambia el CP, sin pisar lo que escribió a mano.
      let autoEstado = false;
      let autoCiudad = false;

      pais.addEventListener('input', actualizarSugerencias);
      pais.addEventListener('blur', () => {
        aFormaOficial(pais, catalogo.paises);
        actualizarSugerencias();
      });
      estado.addEventListener('input', () => {
        autoEstado = false;
        actualizarSugerencias();
      });
      estado.addEventListener('blur', () => {
        if (sinPais() || esMexico(pais.value)) aFormaOficial(estado, catalogo.estadosMexico);
        actualizarSugerencias();
      });
      ciudad.addEventListener('input', () => { autoCiudad = false; });

      // Al completar un CP conocido (5 dígitos) se llenan país, estado y ciudad.
      cp.addEventListener('input', () => {
        if (cp.value.length !== 5) return;
        if (!sinPais() && !esMexico(pais.value)) return; // los CP del catálogo son de México
        const hallado = ejemplos.find((e) => e.cp === cp.value);
        if (!hallado) return; // CP desconocido: captura manual

        if (sinPais()) {
          pais.value = 'México';
          validarTexto(pais, 'El país');
        }
        if (!estado.value.trim() || autoEstado) {
          estado.value = hallado.estado;
          autoEstado = true;
          validarTexto(estado, 'El estado');
        }
        if (!ciudad.value.trim() || autoCiudad) {
          ciudad.value = hallado.ciudad;
          autoCiudad = true;
          validarTexto(ciudad, 'La ciudad');
        }
        actualizarSugerencias();
      });

      // "Limpiar Formularios" también reinicia las sugerencias.
      form.addEventListener('reset', () => {
        setTimeout(() => {
          autoEstado = false;
          autoCiudad = false;
          actualizarSugerencias();
        }, 0);
      });

      actualizarSugerencias();
    }

    /* ---------- Términos y condiciones ---------- */
    function validarTerminos() {
      if (terminos) {
        marcar(terminos, terminos.checked ? '' : 'Debes aceptar los términos y condiciones para continuar.');
      }
    }
    if (terminos) terminos.addEventListener('change', validarTerminos);

    /* ---------- Campos obligatorios ----------
       Se exigen en JS (sin atributo required) para no alterar el diseño.
       El apellido materno es opcional porque hay personas que no lo tienen. */
    const obligatorios = [
      [nombre, 'Nombre'],
      [apPaterno, 'Apellido paterno'],
      [fechaNac, 'Fecha de nacimiento'],
      [email, 'Correo electrónico'],
      [tel, 'Número telefónico'],
      [horaIni, 'Horario de contacto (inicio)'],
      [horaFin, 'Horario de contacto (fin)'],
      [usuario, 'Usuario'],
      [pass, 'Contraseña'],
      [pass2, 'Confirmar contraseña'],
      [direccion, 'Dirección'],
      [pais, 'País'],
      [estado, 'Estado'],
      [ciudad, 'Ciudad'],
      [cp, 'Código postal']
    ].filter(([el]) => el);

    function validarObligatorios() {
      obligatorios.forEach(([el, etiqueta]) => {
        if (!el.value.trim()) marcar(el, `Completa el campo «${etiqueta}».`);
      });
    }

    /* ---------- Ejecuta todas las validaciones ---------- */
    function ejecutarValidaciones() {
      // Limpia mensajes viejos de "campo obligatorio" antes de reevaluar.
      obligatorios.forEach(([el]) => marcar(el, ''));
      camposTexto.forEach(([el, etiqueta]) => validarTexto(el, etiqueta));
      actualizarEdad();
      validarTelefono();
      validarHorario();
      validarUsuario();
      validarPassword();
      validarCP();
      validarTerminos();
      redesUrl.forEach(validarRed);
      validarWhatsapp();
      validarRedesMinimas();
      validarObligatorios(); // al final: pisa el mensaje de los campos vacíos
    }

    /* ---------- Asistente por pasos ---------- */
    function aplicarPaso() {
      // Los pasos posteriores al activo quedan deshabilitados.
      fieldsets.forEach((fs, i) => { fs.disabled = i > paso; });
      botonesSiguiente.forEach((boton, i) => {
        if (boton) boton.disabled = terminado || i !== paso;
      });
      // Términos y envío solo se habilitan al completar el último paso.
      if (terminos) terminos.disabled = !terminado;
      if (botonEnviar) botonEnviar.disabled = !terminado;
    }

    const primerInvalido = (contenedor) =>
      Array.from(contenedor.elements).find((el) => el.willValidate && !el.validity.valid);

    function irAlSiguiente(i) {
      ejecutarValidaciones();
      const invalido = primerInvalido(fieldsets[i]);
      if (invalido) {
        Sonido.tocar('error');
        invalido.reportValidity();
        return;
      }

      Sonido.tocar('ok');
      let destino;
      if (i < fieldsets.length - 1) {
        paso = i + 1;
        destino = fieldsets[paso];
      } else {
        terminado = true;
        destino = terminos;
      }
      aplicarPaso();

      if (destino) {
        if (typeof destino.scrollIntoView === 'function') {
          destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        const primero = destino === terminos
          ? terminos
          : $('input:not([type="hidden"]):not(:disabled), select:not(:disabled)', destino);
        if (primero) primero.focus({ preventScroll: true });
      }
    }

    botonesSiguiente.forEach((boton, i) => {
      if (!boton) return;
      boton.addEventListener('click', (e) => {
        e.preventDefault();
        irAlSiguiente(i);
      });
    });

    // Enter dentro de un paso equivale a pulsar "Siguiente".
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || terminado) return;
      const objetivo = e.target;
      if (!['INPUT', 'SELECT'].includes(objetivo.tagName)) return;
      if (['button', 'submit', 'reset', 'file'].includes(objetivo.type)) return;
      e.preventDefault();
      if (botonesSiguiente[paso]) botonesSiguiente[paso].click();
    });

    /* ---------- Enviar solicitud ---------- */
    let reinicioInterno = false; // distingue el reset del botón del reset tras enviar

    form.addEventListener('submit', (e) => {
      e.preventDefault(); // evita recargar la página (no hay servidor todavía)
      if (!terminado) return;
      ejecutarValidaciones();
      if (!form.checkValidity()) {
        Sonido.tocar('error');
        form.reportValidity();
        return;
      }

      const textoDe = (select) => select.options[select.selectedIndex].text;
      const redesSociales = redesUrl
        .filter((r) => r.casilla.checked && r.url.value.trim())
        .map((r) => ({ red: r.nombre, url: r.url.value.trim() }));
      if (hayWhatsapp && chkWa.checked && qrDatos) {
        redesSociales.push({
          red: 'WhatsApp',
          qrNombre: qrInput.files[0] ? qrInput.files[0].name : '',
          qrImagen: qrDatos
        });
      }

      const solicitud = {
        titulo: titulo.value,
        nombre: nombre.value.trim(),
        apellidoPaterno: apPaterno.value.trim(),
        apellidoMaterno: apMaterno.value.trim(),
        genero: textoDe(genero),
        fechaNacimiento: fechaNac.value,
        edad: edadCalculada,
        mayorDeEdad: edadCalculada !== null ? edadCalculada >= 18 : null,
        email: email.value.trim(),
        telefono: tel.value.trim(),
        horarioContacto: horaIni.value && horaFin.value ? `${horaIni.value} - ${horaFin.value}` : '',
        redesSociales,
        usuario: usuario.value.trim(), // la contraseña NO se guarda
        direccion: direccion.value.trim(),
        pais: pais.value.trim(),
        estado: estado.value.trim(),
        ciudad: ciudad.value.trim(),
        codigoPostal: cp.value,
        fechaSolicitud: new Date().toISOString()
      };

      const solicitudes = Almacen.leer(CLAVES.solicitudes, []);
      solicitudes.push(solicitud);
      if (!Almacen.guardar(CLAVES.solicitudes, solicitudes)) {
        avisar('No se pudo guardar la solicitud en este navegador (puede que la imagen del QR sea muy pesada). Intenta de nuevo.', 'error');
        return;
      }

      avisar(`¡Solicitud enviada! Gracias, ${solicitud.nombre}. Revisaremos tus datos para activar tu cuenta.`, 'ok');
      reinicioInterno = true;
      form.reset();
      reinicioInterno = false;
    });

    /* ---------- Limpiar formulario (con confirmación) ---------- */
    form.addEventListener('reset', (e) => {
      if (!reinicioInterno && !window.confirm('¿Deseas limpiar todos los campos del formulario?')) {
        e.preventDefault();
        return;
      }
      // Espera a que el navegador vacíe los campos y regresa al primer paso.
      setTimeout(() => {
        paso = 0;
        terminado = false;
        sincronizarRedes();
        ejecutarValidaciones();
        aplicarPaso();
      }, 0);
    });

    sincronizarRedes();
    ejecutarValidaciones();
    aplicarPaso();
  }

  /* ===================================================================
     3. MIS CITAS  (#citas)
     Filtra las filas de la tabla por el mes o la semana elegidos.
     =================================================================== */
  function iniciarCitas() {
    const mes = $('#mesCitas');
    const semana = $('#semanaCitas');
    const boton = $('#verCitas');
    const tabla = $('#citas table');
    if (!mes || !semana || !boton || !tabla) return;

    const MESES = {
      enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
      julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
    };
    const DIA_MS = 86400000;

    const filasDeDatos = () => $$('tr', tabla).filter((tr) => tr.querySelector('td'));

    // "10 de Octubre de 2026" -> milisegundos UTC de esa fecha.
    function leerFecha(texto) {
      const m = /(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/.exec(normalizar(texto));
      if (!m || MESES[m[2]] === undefined) return null;
      return Date.UTC(Number(m[3]), MESES[m[2]], Number(m[1]));
    }

    // "2026-W43" -> lunes y domingo de esa semana ISO.
    function rangoSemana(valor) {
      const m = /^(\d{4})-W(\d{2})$/.exec(valor);
      if (!m) return null;
      const anio = Number(m[1]);
      const sem = Number(m[2]);
      const diaDelCuatro = (new Date(Date.UTC(anio, 0, 4)).getUTCDay() + 6) % 7;
      const lunes = Date.UTC(anio, 0, 4 - diaDelCuatro + (sem - 1) * 7);
      return { inicio: lunes, fin: lunes + 6 * DIA_MS };
    }

    function mostrarTodas() {
      filasDeDatos().forEach((tr) => { tr.style.display = ''; });
    }

    function filtrarCitas() {
      let inicio;
      let fin;
      let descripcion;

      if (mes.value) {
        const [a, m] = mes.value.split('-').map(Number);
        inicio = Date.UTC(a, m - 1, 1);
        fin = Date.UTC(a, m, 0); // último día del mes
        descripcion = new Date(a, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
      } else if (semana.value) {
        const rango = rangoSemana(semana.value);
        if (!rango) return avisar('La semana elegida no es válida.', 'error');
        inicio = rango.inicio;
        fin = rango.fin;
        const f = (ms) => new Date(ms).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' });
        descripcion = `la semana del ${f(inicio)} al ${f(fin)}`;
      } else {
        mostrarTodas();
        return avisar('Por favor elige un mes o una semana para ver las citas.', 'error');
      }

      let visibles = 0;
      filasDeDatos().forEach((tr) => {
        const fecha = leerFecha(tr.cells[3] ? tr.cells[3].textContent : '');
        const coincide = fecha !== null && fecha >= inicio && fecha <= fin;
        tr.style.display = coincide ? '' : 'none';
        if (coincide) visibles++;
      });

      if (visibles === 0) {
        avisar(`No hay citas programadas para ${descripcion}.`, 'error');
      } else {
        Sonido.tocar('click');
      }
    }

    // Mes y semana son excluyentes ("O por favor elige una semana").
    mes.addEventListener('change', () => { if (mes.value) semana.value = ''; });
    semana.addEventListener('change', () => { if (semana.value) mes.value = ''; });

    boton.addEventListener('click', (e) => {
      e.preventDefault(); // el botón está dentro de un <form>: evita recargar
      filtrarCitas();
    });

    // Enter en los selectores de mes/semana equivale a pulsar "Ver Citas".
    [mes, semana].forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          filtrarCitas();
        }
      });
    });
  }

  /* ===================================================================
     4. AGENDAR CITA  (#agendar)
     El botón con id="btnAgendarCita" valida los datos y guarda la
     solicitud de cita.
     =================================================================== */
  function iniciarAgendar() {
    const fecha = $('#dateAppoiment');
    const sucursal = $('input[list="locationsList"]');
    const lista = $('#locationsList');
    const descripcion = $('#descriptionText');
    if (!fecha || !sucursal || !lista || !descripcion) return;

    // El <label for="locations"> no tenía un campo con ese id: se lo asignamos.
    sucursal.id = 'locations';

    // No se pueden elegir fechas pasadas.
    const actualizarMinimo = () => { fecha.min = aFechaHoraISO(new Date()); };
    actualizarMinimo();
    fecha.addEventListener('focus', actualizarMinimo);

    function agendarCita() {
      const errores = [];
      const sucursales = $$('option', lista).map((o) => normalizar(o.value));

      if (!fecha.value) {
        errores.push('Elige la fecha y la hora de la cita.');
      } else if (new Date(fecha.value) < new Date()) {
        errores.push('La fecha de la cita no puede estar en el pasado.');
      }
      if (!sucursal.value.trim()) {
        errores.push('Elige una sucursal.');
      } else if (!sucursales.includes(normalizar(sucursal.value))) {
        errores.push('Elige una sucursal de la lista.');
      }
      if (descripcion.value.trim().length < 10) {
        errores.push('Describe el motivo de la cita (mínimo 10 caracteres).');
      }

      if (errores.length) {
        avisar('Revisa los datos de la cita:\n\n• ' + errores.join('\n• '), 'error');
        return;
      }

      const citas = Almacen.leer(CLAVES.citasAgendadas, []);
      citas.push({
        fecha: fecha.value,
        sucursal: sucursal.value.trim(),
        descripcion: descripcion.value.trim(),
        estatus: 'Programada',
        creada: new Date().toISOString()
      });
      Almacen.guardar(CLAVES.citasAgendadas, citas);

      avisar('¡Cita solicitada correctamente!', 'ok');
      fecha.value = '';
      sucursal.value = '';
      descripcion.value = '';
    }

    const botonAgendar = $('#btnAgendarCita');
    if (botonAgendar) {
      botonAgendar.addEventListener('click', (e) => {
        e.preventDefault();
        agendarCita();
      });
    }
  }

  /* ===================================================================
     5. HERRAMIENTAS  (#herramientas)
     - Las casillas "Herramienta" / "Refacción" filtran la lista de piezas.
     - "Solicitar Herramienta" agrega (o suma) la pieza a la tabla de la
       orden de servicio y recalcula numeración y total.
     =================================================================== */
  function iniciarHerramientas() {
    const panel = $('#herramientas');
    if (!panel) return;

    const chkHerramienta = $('#chkHerramienta');
    const chkRefaccion = $('#chkRefaccion');
    const select = $('select', panel);
    const cantidad = $('#toolQuantity');
    const boton = $('#requestTool');
    const tbody = $('table tbody', panel);
    const celdaTotal = $('table tfoot td:nth-child(2)', panel);
    if (!chkHerramienta || !chkRefaccion || !select || !cantidad || !boton || !tbody || !celdaTotal) return;

    // El <label for="toolName"> no tenía un campo con ese id: se lo asignamos.
    select.id = 'toolName';

    const grupos = $$('optgroup', select);
    const esGrupoHerramienta = (grupo) => /herramienta/i.test(grupo.label);

    // Categoría que se muestra en la tabla (usa las mismas de tu tabla).
    const CATEGORIA_HERRAMIENTA = {
      llave_combinada: 'Herramienta manual',
      llave_torx: 'Herramienta manual'
    };
    const CATEGORIA_REFACCION = {
      'piezas de motor': 'Refacción de motor',
      'piezas de transmision': 'Refacción de transmisión',
      'piezas de suspension': 'Refacción de suspensión'
    };
    function categoriaDe(opcion) {
      const grupo = opcion.parentElement;
      if (esGrupoHerramienta(grupo)) {
        return CATEGORIA_HERRAMIENTA[opcion.value] || 'Herramienta especializada';
      }
      return CATEGORIA_REFACCION[normalizar(grupo.label)] || 'Refacción';
    }

    // Muestra solo los grupos que corresponden a las casillas marcadas.
    // Sin casillas marcadas (o con ambas) se muestran todas las piezas.
    function filtrarPiezas() {
      const verH = chkHerramienta.checked;
      const verR = chkRefaccion.checked;
      const todas = verH === verR;
      grupos.forEach((grupo) => {
        const mostrar = todas || (esGrupoHerramienta(grupo) ? verH : verR);
        grupo.hidden = !mostrar;
        grupo.disabled = !mostrar;
      });
      const actual = select.selectedOptions[0];
      if (!actual || actual.parentElement.disabled) {
        const primera = $$('optgroup:not([disabled]) option', select)[0];
        if (primera) primera.selected = true;
      }
    }
    chkHerramienta.addEventListener('change', () => { filtrarPiezas(); Sonido.tocar('click'); });
    chkRefaccion.addEventListener('change', () => { filtrarPiezas(); Sonido.tocar('click'); });

    // Mantiene el mismo formato singular/plural de tu tabla (Pieza/Piezas, Juego/Juegos).
    function ajustarUnidad(celda, total) {
      const base = celda.textContent.trim().replace(/s$/i, '');
      celda.textContent = total === 1 ? base : base + 's';
    }

    function renumerarYTotalizar() {
      let total = 0;
      $$('tr', tbody).forEach((fila, i) => {
        fila.cells[0].textContent = i + 1;
        total += parseInt(fila.cells[3].textContent, 10) || 0;
      });
      celdaTotal.textContent = total;
    }

    // Suma a una fila existente (mismo nombre) o crea una nueva.
    function agregarALaTabla(nombrePieza, categoria, unidades) {
      const clave = normalizar(nombrePieza);
      const existente = $$('tr', tbody).find((fila) => normalizar(fila.cells[1].textContent) === clave);
      if (existente) {
        const nuevoTotal = (parseInt(existente.cells[3].textContent, 10) || 0) + unidades;
        existente.cells[3].textContent = nuevoTotal;
        ajustarUnidad(existente.cells[4], nuevoTotal);
      } else {
        const fila = tbody.insertRow();
        [ '', nombrePieza, categoria, unidades, unidades === 1 ? 'Pieza' : 'Piezas' ].forEach((texto) => {
          fila.insertCell().textContent = texto;
        });
      }
      renumerarYTotalizar();
    }

    function solicitarHerramienta() {
      const opcion = select.selectedOptions[0];
      const unidades = Number(cantidad.value);

      if (!opcion) return avisar('Elige una pieza de la lista.', 'error');
      if (!cantidad.value || !Number.isInteger(unidades) || unidades < 1 || unidades > 10) {
        cantidad.focus();
        return avisar('Escribe una cantidad entera entre 1 y 10.', 'error');
      }

      const nombrePieza = opcion.textContent.trim();
      const categoria = categoriaDe(opcion);
      agregarALaTabla(nombrePieza, categoria, unidades);

      const pedidos = Almacen.leer(CLAVES.herramientas, []);
      pedidos.push({ nombre: nombrePieza, categoria, cantidad: unidades });
      Almacen.guardar(CLAVES.herramientas, pedidos);

      cantidad.value = '';
      avisar(`Se agregó a la orden de servicio: ${unidades} × ${nombrePieza}.`, 'ok');
    }

    boton.addEventListener('click', (e) => {
      e.preventDefault(); // el botón está dentro de un <form>: evita recargar
      solicitarHerramienta();
    });
    cantidad.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        solicitarHerramienta();
      }
    });

    // Estado inicial: restaura lo solicitado antes y deja el total correcto.
    Almacen.leer(CLAVES.herramientas, []).forEach((p) => agregarALaTabla(p.nombre, p.categoria, p.cantidad));
    renumerarYTotalizar();
    filtrarPiezas();
  }

  /* ===================================================================
     6. MI CUENTA  (#cuenta)
     No hay botón "Guardar" en el HTML, por eso los cambios se guardan
     automáticamente al elegir un archivo o al terminar de escribir el RFC.
     =================================================================== */
  function iniciarCuenta() {
    const panel = $('#cuenta');
    if (!panel) return;

    // El HTML usa el id "userPhoto" dos veces; se localizan por tipo.
    const fotoInput = $('input[type="file"]:not(#fiscalSituacion)', panel);
    const fotoImagen = $('input[type="image"]', panel);
    const rfc = $('#rfc');
    const constancia = $('#fiscalSituacion');
    const idUsuario = $('#userId');
    if (!fotoInput || !fotoImagen || !rfc || !constancia) return;

    fotoImagen.id = 'userPhotoPreview'; // id único (invisible)

    // El campo es de "Foto de perfil" pero aceptaba solo .pdf: se aceptan imágenes.
    fotoInput.accept = 'image/*';

    const cuenta = Object.assign({ userId: idUsuario ? idUsuario.value : '' }, Almacen.leer(CLAVES.cuenta, {}));
    const guardarCuenta = () => Almacen.guardar(CLAVES.cuenta, cuenta);

    /* ---------- Foto de perfil ---------- */
    // Hacer clic en la imagen abre el selector de archivos (en vez de enviar el formulario).
    fotoImagen.addEventListener('click', (e) => {
      e.preventDefault();
      fotoInput.click();
    });

    fotoInput.addEventListener('change', () => {
      const archivo = fotoInput.files[0];
      if (!archivo) return;

      if (!archivo.type.startsWith('image/')) {
        fotoInput.value = '';
        return avisar('La foto de perfil debe ser una imagen (JPG, PNG, GIF, WEBP…).', 'error');
      }
      if (archivo.size > CONFIG.fotoMaxMB * 1048576) {
        fotoInput.value = '';
        return avisar(`La foto no debe pesar más de ${CONFIG.fotoMaxMB} MB.`, 'error');
      }

      const lector = new FileReader();
      lector.onload = () => {
        fotoImagen.src = lector.result;
        if (Almacen.guardar(CLAVES.foto, lector.result)) {
          avisar('Foto de perfil actualizada.', 'ok');
        } else {
          avisar('La foto se muestra, pero no pudo guardarse en este navegador.', 'error');
        }
      };
      lector.onerror = () => avisar('No se pudo leer la imagen. Intenta con otra.', 'error');
      lector.readAsDataURL(archivo);
    });

    const fotoGuardada = Almacen.leer(CLAVES.foto, null);
    if (fotoGuardada) fotoImagen.src = fotoGuardada;

    /* ---------- RFC ---------- */
    // 3 letras (persona moral) o 4 (persona física) + fecha AAMMDD + homoclave de 3.
    const REGEX_RFC = /^[A-ZÑ&]{3,4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z0-9]{3}$/;
    function validarRfc() {
      const valor = rfc.value;
      rfc.setCustomValidity(valor && !REGEX_RFC.test(valor)
        ? 'RFC no válido: debe tener 12 caracteres (persona moral) o 13 (persona física), por ejemplo XAXX010101000.'
        : '');
      return rfc.validity.valid;
    }
    rfc.addEventListener('input', () => {
      const pos = rfc.selectionStart;
      rfc.value = rfc.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, '');
      try { rfc.setSelectionRange(pos, pos); } catch (e) { /* ignorar */ }
      validarRfc();
    });
    rfc.addEventListener('change', () => {
      if (!rfc.value) {
        delete cuenta.rfc;
        guardarCuenta();
        return;
      }
      if (validarRfc()) {
        cuenta.rfc = rfc.value;
        guardarCuenta();
        Sonido.tocar('ok');
      } else {
        Sonido.tocar('error');
        rfc.reportValidity();
      }
    });
    if (cuenta.rfc) {
      rfc.value = cuenta.rfc;
      validarRfc();
    }

    /* ---------- Constancia de situación fiscal (PDF) ---------- */
    constancia.addEventListener('change', () => {
      const archivo = constancia.files[0];
      if (!archivo) return;

      const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
      if (!esPdf) {
        constancia.value = '';
        return avisar('La constancia de situación fiscal debe ser un archivo PDF.', 'error');
      }
      if (archivo.size > CONFIG.constanciaMaxMB * 1048576) {
        constancia.value = '';
        return avisar(`El PDF no debe pesar más de ${CONFIG.constanciaMaxMB} MB.`, 'error');
      }

      cuenta.constancia = { nombre: archivo.name, tamanoKB: Math.round(archivo.size / 1024) };
      guardarCuenta();
      avisar(`Constancia cargada: ${archivo.name}`, 'ok');
    });
  }

  /* ===================================================================
     7. AJUSTES  (#ajustes)
     - Color de fuente  -> cambia la variable CSS --text
     - Color de fondo   -> cambia la variable CSS --bg
     - Volumen / Silenciar -> controla el volumen de los sonidos de la página
     Las preferencias se recuerdan entre visitas.
     =================================================================== */
  function iniciarAjustes() {
    const fuente = $('#fontColor');
    const fondo = $('#backgroundColor');
    const volumen = $('#volumenControl');
    const botonSilencio = $('#btnSilenciar');
    if (!fuente || !fondo || !volumen || !botonSilencio) return;

    const raiz = document.documentElement;
    const REGEX_HEX = /^#[0-9a-f]{6}$/i;

    // Colores reales de la página (para que los selectores muestren lo que se ve).
    const leerVariable = (nombre) => getComputedStyle(raiz).getPropertyValue(nombre).trim();
    const colorTextoOriginal = leerVariable('--text');
    const colorFondoOriginal = leerVariable('--bg');
    if (REGEX_HEX.test(colorTextoOriginal)) fuente.value = colorTextoOriginal;
    if (REGEX_HEX.test(colorFondoOriginal)) fondo.value = colorFondoOriginal;

    const estado = Object.assign(
      { fontColor: null, bgColor: null, volumen: Number(volumen.value), previo: Number(volumen.value) || 50, silenciado: false },
      Almacen.leer(CLAVES.ajustes, {})
    );
    const guardar = () => Almacen.guardar(CLAVES.ajustes, estado);

    /* ---------- Colores ---------- */
    // Contraste contra el blanco de las tarjetas, para no dejar el texto ilegible.
    function contrasteConBlanco(hex) {
      const [r, g, b] = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
      const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return 1.05 / (luminancia + 0.05);
    }
    const FUENTE_LEGIBLE = 3;

    function aplicarFuente(hex) {
      raiz.style.setProperty('--text', hex);
      fuente.value = hex;
    }
    function aplicarFondo(hex) {
      raiz.style.setProperty('--bg', hex);
      fondo.value = hex;
    }

    fuente.addEventListener('input', () => {
      if (contrasteConBlanco(fuente.value) >= FUENTE_LEGIBLE) aplicarFuente(fuente.value);
    });
    fuente.addEventListener('change', () => {
      if (contrasteConBlanco(fuente.value) < FUENTE_LEGIBLE) {
        avisar('Ese color de fuente casi no se distingue sobre las tarjetas blancas. Elige uno más oscuro.', 'error');
        fuente.value = estado.fontColor || (REGEX_HEX.test(colorTextoOriginal) ? colorTextoOriginal : '#000000');
        return;
      }
      estado.fontColor = fuente.value;
      guardar();
      Sonido.tocar('click');
    });

    fondo.addEventListener('input', () => aplicarFondo(fondo.value));
    fondo.addEventListener('change', () => {
      estado.bgColor = fondo.value;
      guardar();
      Sonido.tocar('click');
    });

    if (estado.fontColor && REGEX_HEX.test(estado.fontColor)) aplicarFuente(estado.fontColor);
    if (estado.bgColor && REGEX_HEX.test(estado.bgColor)) aplicarFondo(estado.bgColor);

    /* ---------- Volumen y silencio ---------- */
    function refrescarSonido() {
      volumen.value = estado.volumen;
      Sonido.volumen = estado.volumen;
      Sonido.aplicarAMedios();
      botonSilencio.textContent = estado.silenciado ? 'Activar sonido' : 'Silenciar';
      botonSilencio.setAttribute('aria-pressed', String(estado.silenciado));
    }

    volumen.addEventListener('input', () => {
      const valor = Number(volumen.value);
      estado.volumen = valor;
      estado.silenciado = valor === 0;
      if (valor > 0) estado.previo = valor;
      refrescarSonido();
      guardar();
    });
    // Al soltar el control se escucha una muestra con el nuevo volumen.
    volumen.addEventListener('change', () => Sonido.tocar('click'));

    botonSilencio.addEventListener('click', (e) => {
      e.preventDefault();
      if (estado.silenciado) {
        estado.silenciado = false;
        estado.volumen = estado.previo > 0 ? estado.previo : 50;
      } else {
        if (estado.volumen > 0) estado.previo = estado.volumen;
        estado.silenciado = true;
        estado.volumen = 0;
      }
      refrescarSonido();
      guardar();
      Sonido.tocar('click');
    });

    estado.silenciado = estado.volumen === 0;
    refrescarSonido();
  }

  /* ===================================================================
     8. FORMULARIO CONTENEDOR
     Mis Citas, Cuenta, Agendar, Herramientas y Ajustes están dentro de un
     mismo <form> sin acción. Se bloquea el envío para que ni Enter ni un
     botón recarguen la página.
     =================================================================== */
  function iniciarFormularioContenedor() {
    const form = $('main form:not(#registro)');
    if (!form) return;

    form.addEventListener('submit', (e) => e.preventDefault());

    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const objetivo = e.target;
      if (objetivo.tagName !== 'INPUT') return;
      // Se permite Enter en botones e imagen (los maneja su propio evento click).
      if (['button', 'image', 'submit', 'reset'].includes(objetivo.type)) return;
      e.preventDefault(); // evita el "envío implícito" del formulario
    });
  }

  /* ===================================================================
     9. ARRANQUE
     Cada módulo se inicia por separado: si uno fallara, los demás
     seguirían funcionando.
     =================================================================== */
  function iniciar() {
    const modulos = [
      ['Ajustes', iniciarAjustes],
      ['Formulario contenedor', iniciarFormularioContenedor],
      ['Menú', iniciarMenu],
      ['Registro', iniciarRegistro],
      ['Mis Citas', iniciarCitas],
      ['Agendar Cita', iniciarAgendar],
      ['Herramientas', iniciarHerramientas],
      ['Mi Cuenta', iniciarCuenta]
    ];
    modulos.forEach(([nombre, funcion]) => {
      try {
        funcion();
      } catch (error) {
        console.error(`[MecaGest] Error al iniciar "${nombre}":`, error);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();