// Práctica 01: primer mensaje en la consola del navegador.
console.log("Hola mundo");

// Práctica 02: calcular y mostrar la edad sin enviar el formulario.
const fechaNacimiento = document.getElementById('fechaNacimiento');
const inputEdad = document.getElementById('edad');

if (fechaNacimiento && inputEdad) {

    // Se ejecuta al seleccionar o modificar una fecha.
    fechaNacimiento.addEventListener("change", function () {

        // Si el usuario borra la fecha, limpiamos el input de la edad.
        if (fechaNacimiento.value === "") {
            inputEdad.value = "";
            return;
        }

        // Un input date devuelve su valor con formato AAAA-MM-DD.
        const [anio, mes, dia] = fechaNacimiento.value.split("-").map(Number);
        const nacimiento = new Date(anio, mes - 1, dia); // Meses: 0 = enero.
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0); // Comparar fechas, sin horas.

        // Si la fecha es futura, mostramos el error en el input
        if (nacimiento > hoy) {
            inputEdad.value = "Error: Fecha futura";
            return;
        }

        // Calculamos la edad.
        let edad = hoy.getFullYear() - nacimiento.getFullYear();

        // Comprobamos si todavía no ha cumplido años este año.
        const mesActual = hoy.getMonth() + 1;
        const diaActual = hoy.getDate();

        if (
            mesActual < mes ||
            (mesActual === mes && diaActual < dia)
        ) {
            edad--;
        }

        // Evaluamos si es mayor o menor de edad y lo mostramos en el input
        if (edad >= 18) {
            inputEdad.value = `${edad} años - Mayor de edad`;
        } else {
            inputEdad.value = `${edad} años - Menor de edad`;
        }
    });
}