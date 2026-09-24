"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function PuntoDeVenta() {
  const [pestanaActiva, setPestanaActiva] = useState<"pos" | "inventario" | "reporte" | "caja">("pos");

  // Estado POS
  const [productos, setProductos] = useState<any[]>([]);
  const [categoriasMap, setCategoriasMap] = useState<Record<number, string>>({});
  const [listaCategorias, setListaCategorias] = useState<{ id: number; nombre: string }[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string>("Todos");
  const [carrito, setCarrito] = useState<any[]>([]);
  const [metodoPago, setMetodoPago] = useState<string>("Efectivo");
  const [cargando, setCargando] = useState(false);
  const [ticketImpresion, setTicketImpresion] = useState<any | null>(null);

  // Estado Cuentas Abiertas / Mesas
  const [cuentasAbiertas, setCuentasAbiertas] = useState<{ id: string; nombreMesa: string; items: any[] }[]>([]);
  const [nombreMesaActual, setNombreMesaActual] = useState("");
  const [cuentaActivaId, setCuentaActivaId] = useState<string | null>(null);

  // Estado Cierre de Caja
  const [fondoInicial, setFondoInicial] = useState<number>(50.0);
  const [efectivoContado, setEfectivoContado] = useState<string>("");

  // Estado Reportes
  const [ventas, setVentas] = useState<any[]>([]);
  const [cargandoReporte, setCargandoReporte] = useState(false);
  const [ventaSeleccionada, setVentaSeleccionada] = useState<any | null>(null);

  // Estado Inventario Forms
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [nuevoPrecioVenta, setNuevoPrecioVenta] = useState("");
  const [nuevoPrecioCompra, setNuevoPrecioCompra] = useState("");
  const [nuevoStock, setNuevoStock] = useState("");
  const [nuevaCategoriaId, setNuevaCategoriaId] = useState("");
  const [nuevaImagenUrl, setNuevaImagenUrl] = useState("");

  const [reponerProductoId, setReponerProductoId] = useState("");
  const [reponerCantidad, setReponerCantidad] = useState("");

  const cargarDatosGlobales = async () => {
    const { data: catData } = await supabase
      .from("categorias")
      .select("*")
      .order("id", { ascending: true });

    const { data: prodData } = await supabase
      .from("productos")
      .select("*")
      .eq("activo", true)
      .order("id", { ascending: true });

    const mapa: Record<number, string> = {};
    if (catData) {
      catData.forEach((c) => (mapa[c.id] = c.nombre));
      setListaCategorias(catData);
      setCategoriasMap(mapa);
    }

    if (prodData) {
      setProductos(prodData);
    }
  };

  const cargarReporteVentas = async () => {
    setCargandoReporte(true);
    const { data, error } = await supabase
      .from("ventas")
      .select("*, detalle_ventas(*, productos(*))")
      .order("id", { ascending: false });

    if (!error) {
      setVentas(data || []);
    }
    setCargandoReporte(false);
  };

  useEffect(() => {
    cargarDatosGlobales();
  }, []);

  useEffect(() => {
    if (pestanaActiva === "reporte" || pestanaActiva === "caja") {
      cargarReporteVentas();
    }
  }, [pestanaActiva]);

  // --- LÓGICA DE POS Y CUENTAS ABIERTAS ---
  const productosFiltrados =
    categoriaSeleccionada === "Todos"
      ? productos
      : productos.filter(
          (p) => categoriasMap[p.categoria_id] === categoriaSeleccionada
        );

  const agregarAlCarrito = (producto: any) => {
    const itemExistente = carrito.find((item) => item.id === producto.id);

    if (itemExistente) {
      if (itemExistente.cantidad >= producto.stock) {
        alert(`No hay suficiente stock disponible de ${producto.nombre}`);
        return;
      }
      setCarrito(
        carrito.map((item) =>
          item.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        )
      );
    } else {
      if (producto.stock > 0) {
        setCarrito([...carrito, { ...producto, cantidad: 1, precio_compra: producto.precio_compra || 0 }]);
      } else {
        alert("Este producto está agotado.");
      }
    }
  };

  const guardarEnCuentaAbierta = () => {
    if (carrito.length === 0) return;
    const nombre = nombreMesaActual.trim() || `Mesa ${cuentasAbiertas.length + 1}`;

    if (cuentaActivaId) {
      setCuentasAbiertas(
        cuentasAbiertas.map((c) =>
          c.id === cuentaActivaId ? { ...c, items: carrito } : c
        )
      );
    } else {
      const nuevaCuenta = {
        id: Date.now().toString(),
        nombreMesa: nombre,
        items: carrito,
      };
      setCuentasAbiertas([...cuentasAbiertas, nuevaCuenta]);
    }

    setCarrito([]);
    setNombreMesaActual("");
    setCuentaActivaId(null);
    alert(`Cuenta "${nombre}" guardada con éxito.`);
  };

  const cargarCuentaAbierta = (cuenta: any) => {
    setCuentaActivaId(cuenta.id);
    setNombreMesaActual(cuenta.nombreMesa);
    setCarrito(cuenta.items);
  };

  const totalCarrito = carrito.reduce(
    (suma, item) => suma + item.precio_venta * item.cantidad,
    0
  );

  const procesarVenta = async () => {
    setCargando(true);
    try {
      const { data: ventaData, error: errorVenta } = await supabase
        .from("ventas")
        .insert([{ total: totalCarrito, metodo_pago: metodoPago }])
        .select()
        .single();

      if (errorVenta) throw errorVenta;

      const itemsDetalle = [];
      for (const item of carrito) {
        const subtotal = item.cantidad * item.precio_venta;
        const { error: errorDetalle } = await supabase
          .from("detalle_ventas")
          .insert([
            {
              venta_id: ventaData.id,
              producto_id: item.id,
              cantidad: item.cantidad,
              precio_unitario: item.precio_venta,
              subtotal: subtotal,
            },
          ]);

        if (errorDetalle) throw errorDetalle;

        await supabase
          .from("productos")
          .update({ stock: item.stock - item.cantidad })
          .eq("id", item.id);

        itemsDetalle.push({
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio_unitario: item.precio_venta,
          subtotal: subtotal,
        });
      }

      if (cuentaActivaId) {
        setCuentasAbiertas(cuentasAbiertas.filter((c) => c.id !== cuentaActivaId));
      }

      const ticketInfo = {
        id: ventaData.id,
        mesa: nombreMesaActual || "Venta Directa",
        fecha: new Date().toLocaleString(),
        metodoPago: metodoPago,
        total: totalCarrito,
        items: itemsDetalle,
      };

      setTicketImpresion(ticketInfo);
      setCarrito([]);
      setNombreMesaActual("");
      setCuentaActivaId(null);
      cargarDatosGlobales();

      setTimeout(() => {
        window.print();
      }, 400);

    } catch (error: any) {
      alert(`Error al procesar la venta: ${error.message || JSON.stringify(error)}`);
    } finally {
      setCargando(false);
    }
  };

  // --- LÓGICA DE INVENTARIO ---
  const handleAgregarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre || !nuevoPrecioVenta || !nuevoStock) {
      alert("Por favor completa los campos obligatorios.");
      return;
    }

    try {
      const { error } = await supabase.from("productos").insert([
        {
          codigo: nuevoCodigo || `COD-${Date.now().toString().slice(-4)}`,
          nombre: nuevoNombre,
          precio_venta: parseFloat(nuevoPrecioVenta),
          precio_compra: nuevoPrecioCompra ? parseFloat(nuevoPrecioCompra) : 0,
          stock: parseInt(nuevoStock),
          categoria_id: nuevaCategoriaId ? parseInt(nuevaCategoriaId) : 1,
          imagen_url: nuevaImagenUrl || null,
          activo: true,
        },
      ]);

      if (error) throw error;

      alert("¡Producto agregado con éxito al inventario!");
      setNuevoNombre("");
      setNuevoCodigo("");
      setNuevoPrecioVenta("");
      setNuevoPrecioCompra("");
      setNuevoStock("");
      setNuevaCategoriaId("");
      setNuevaImagenUrl("");
      cargarDatosGlobales();
    } catch (err: any) {
      alert(`Error al agregar producto: ${err.message}`);
    }
  };

  const handleReponerStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reponerProductoId || !reponerCantidad) {
      alert("Selecciona un producto y la cantidad a reponer.");
      return;
    }

    const prodActual = productos.find((p) => p.id === parseInt(reponerProductoId));
    if (!prodActual) return;

    const nuevoStockTotal = prodActual.stock + parseInt(reponerCantidad);

    try {
      const { error } = await supabase
        .from("productos")
        .update({ stock: nuevoStockTotal })
        .eq("id", prodActual.id);

      if (error) throw error;

      alert(`Stock actualizado. ${prodActual.nombre} ahora tiene ${nuevoStockTotal} uds.`);
      setReponerProductoId("");
      setReponerCantidad("");
      cargarDatosGlobales();
    } catch (err: any) {
      alert(`Error al reponer stock: ${err.message}`);
    }
  };

  // --- CÁLCULOS DE MÉTRICAS Y REPORTES ---
  const hoyStr = new Date().toISOString().split("T")[0];
  const ventasDeHoy = ventas.filter((v) => {
    if (!v.created_at) return true;
    return new Date(v.created_at).toISOString().split("T")[0] === hoyStr;
  });

  const totalVendidoHoy = ventasDeHoy.reduce((acc, v) => acc + Number(v.total || 0), 0);
  const totalEfectivoHoy = ventasDeHoy
    .filter((v) => v.metodo_pago === "Efectivo")
    .reduce((acc, v) => acc + Number(v.total || 0), 0);
  const totalTarjetaHoy = ventasDeHoy
    .filter((v) => v.metodo_pago === "Tarjeta")
    .reduce((acc, v) => acc + Number(v.total || 0), 0);
  const totalYappyHoy = ventasDeHoy
    .filter((v) => v.metodo_pago === "Yappy")
    .reduce((acc, v) => acc + Number(v.total || 0), 0);

  let costoTotalVendido = 0;
  ventasDeHoy.forEach((v) => {
    v.detalle_ventas?.forEach((d: any) => {
      const pCompra = d.productos?.precio_compra || 0;
      costoTotalVendido += d.cantidad * pCompra;
    });
  });
  const gananciaNetaHoy = totalVendidoHoy - costoTotalVendido;

  const efectivoEsperadoEnCaja = fondoInicial + totalEfectivoHoy;
  const numEfectivoContado = parseFloat(efectivoContado || "0");
  const diferenciaCaja = numEfectivoContado - efectivoEsperadoEnCaja;

  const productosCriticos = productos.filter((p) => p.stock < 10);

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-sans text-black">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #seccion-ticket-impresion, #seccion-ticket-impresion * {
            visibility: visible !important;
          }
          #seccion-ticket-impresion {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            padding: 10px !important;
            font-family: monospace !important;
            font-size: 12px !important;
            background: white !important;
            color: black !important;
          }
        }
      `}</style>

      {/* BANNER DE ALERTA DE STOCK CRÍTICO */}
      {productosCriticos.length > 0 && (
        <div className="mb-6 bg-red-600 text-white p-4 rounded-2xl shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold">¡Stock Crítico en {productosCriticos.length} productos!</p>
              <p className="text-xs text-red-100">
                {productosCriticos.map((p) => `${p.nombre} (${p.stock} uds.)`).join(", ")}
              </p>
            </div>
          </div>
          <button
            onClick={() => setPestanaActiva("inventario")}
            className="bg-white text-red-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-50"
          >
            Reponer Mercancía
          </button>
        </div>
      )}

      {/* ENCABEZADO Y NAVEGACIÓN PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-white p-4 sm:p-6 rounded-2xl shadow-sm print:hidden gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-blue-800">Bar El Recreo 🍻</h1>
          <p className="text-xs sm:text-sm text-gray-500">Punto de Venta, Mesas e Inventario</p>
        </div>

        <div className="flex gap-2 overflow-x-auto w-full md:w-auto">
          <button
            onClick={() => setPestanaActiva("pos")}
            className={`px-4 sm:px-5 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
              pestanaActiva === "pos"
                ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            🛒 POS / Mesas
          </button>
          <button
            onClick={() => setPestanaActiva("inventario")}
            className={`px-4 sm:px-5 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
              pestanaActiva === "inventario"
                ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            📦 Inventario {productosCriticos.length > 0 && `(${productosCriticos.length})`}
          </button>
          <button
            onClick={() => setPestanaActiva("caja")}
            className={`px-4 sm:px-5 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
              pestanaActiva === "caja"
                ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            💵 Arqueo de Caja
          </button>
          <button
            onClick={() => setPestanaActiva("reporte")}
            className={`px-4 sm:px-5 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
              pestanaActiva === "reporte"
                ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            📊 Reportes e Historial
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: PUNTO DE VENTA Y CUENTAS ABIERTAS */}
      {pestanaActiva === "pos" && (
        <div className="flex flex-col lg:flex-row gap-6 print:hidden">
          <div className="lg:w-2/3 space-y-6">
            {cuentasAbiertas.length > 0 && (
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                <p className="text-xs font-bold text-blue-800 uppercase mb-2">
                  🍻 Cuentas / Mesas Abiertas ({cuentasAbiertas.length}):
                </p>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {cuentasAbiertas.map((c) => {
                    const totalMesa = c.items.reduce(
                      (acc, i) => acc + i.cantidad * i.precio_venta,
                      0
                    );
                    return (
                      <button
                        key={c.id}
                        onClick={() => cargarCuentaAbierta(c)}
                        className={`p-3 rounded-xl text-left border transition-all whitespace-nowrap ${
                          cuentaActivaId === c.id
                            ? "bg-blue-600 text-white border-blue-600 font-bold"
                            : "bg-white text-gray-800 border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        <p className="text-sm font-bold">{c.nombreMesa}</p>
                        <p className="text-xs font-semibold mt-1">
                          ${totalMesa.toFixed(2)} ({c.items.length} ítems)
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setCategoriaSeleccionada("Todos")}
                className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all shadow-sm ${
                  categoriaSeleccionada === "Todos"
                    ? "bg-blue-600 text-white shadow-blue-200"
                    : "bg-white text-gray-700 hover:bg-gray-200"
                }`}
              >
                Todos
              </button>
              {listaCategorias.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategoriaSeleccionada(cat.nombre)}
                  className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all shadow-sm ${
                    categoriaSeleccionada === cat.nombre
                      ? "bg-blue-600 text-white shadow-blue-200"
                      : "bg-white text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {cat.nombre}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {productosFiltrados.map((producto) => {
                const nombreCat = categoriasMap[producto.categoria_id] || "General";
                const imagenSrc =
                  producto.imagen_url ||
                  "https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&auto=format&fit=crop&q=80";

                return (
                  <div
                    key={producto.id}
                    className="border border-gray-200 rounded-2xl shadow-sm bg-white overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow"
                  >
                    <div className="relative h-32 sm:h-36 bg-gray-100 overflow-hidden flex items-center justify-center">
                      <img
                        src={imagenSrc}
                        alt={producto.nombre}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-2 left-2 bg-black/70 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-md backdrop-blur-sm">
                        {nombreCat}
                      </span>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Cód: {producto.codigo}</p>
                        <h2 className="font-bold text-base sm:text-lg mb-1 leading-tight text-gray-800">
                          {producto.nombre}
                        </h2>
                        <p className="text-xs text-gray-500 font-medium mb-3">
                          Stock:{" "}
                          <span
                            className={
                              producto.stock < 10
                                ? "text-red-500 font-bold"
                                : "text-gray-700"
                            }
                          >
                            {producto.stock} uds.
                          </span>
                        </p>
                      </div>

                      <div className="border-t pt-3 mt-2">
                        <p className="text-xl sm:text-2xl font-black text-green-600 mb-2">
                          ${producto.precio_venta.toFixed(2)}
                        </p>
                        <button
                          onClick={() => agregarAlCarrito(producto)}
                          disabled={producto.stock === 0}
                          className="w-full bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 rounded-xl hover:bg-blue-700 transition-colors text-xs sm:text-sm"
                        >
                          {producto.stock === 0 ? "Agotado" : "Agregar al pedido"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:w-1/3 bg-white p-5 rounded-2xl shadow-md flex flex-col h-auto lg:h-[calc(100vh-10rem)] lg:sticky lg:top-8">
            <h2 className="text-xl font-bold mb-3 border-b pb-2">Ticket de Venta</h2>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Nombre de Mesa / Cuenta:
              </label>
              <input
                type="text"
                placeholder="Ej. Mesa 3 o Juan"
                value={nombreMesaActual}
                onChange={(e) => setNombreMesaActual(e.target.value)}
                className="w-full p-2 border rounded-xl text-sm bg-gray-50 focus:bg-white"
              />
            </div>

            <div className="flex-1 overflow-y-auto max-h-60 lg:max-h-none">
              {carrito.length === 0 ? (
                <p className="text-gray-500 text-center py-6">El carrito está vacío</p>
              ) : (
                carrito.map((item, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center mb-3 pb-2 border-b"
                  >
                    <div>
                      <p className="font-semibold text-sm">{item.nombre}</p>
                      <p className="text-xs text-gray-500">
                        {item.cantidad} x ${item.precio_venta.toFixed(2)}
                      </p>
                    </div>
                    <p className="font-bold text-sm">${(item.cantidad * item.precio_venta).toFixed(2)}</p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t-2 border-dashed">
              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Método de Pago:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {["Efectivo", "Tarjeta", "Yappy"].map((metodo) => (
                    <button
                      key={metodo}
                      onClick={() => setMetodoPago(metodo)}
                      className={`py-2 px-1 text-xs rounded-lg font-medium border transition-colors ${
                        metodoPago === metodo
                          ? "bg-blue-600 text-white border-blue-600 font-bold"
                          : "bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
                      }`}
                    >
                      {metodo}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center mb-4">
                <p className="text-lg font-bold">Total:</p>
                <p className="text-3xl font-black text-blue-700">${totalCarrito.toFixed(2)}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={guardarEnCuentaAbierta}
                  disabled={carrito.length === 0}
                  className="bg-yellow-500 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-xs sm:text-sm hover:bg-yellow-600 transition-colors"
                >
                  📌 Abrir / Dejar Cuenta
                </button>
                <button
                  onClick={procesarVenta}
                  disabled={carrito.length === 0 || cargando}
                  className="bg-green-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-xs sm:text-sm hover:bg-green-700 transition-colors"
                >
                  {cargando ? "Procesando..." : "🖨️ Cobrar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: GESTIÓN DE INVENTARIO */}
      {pestanaActiva === "inventario" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:hidden">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-4 text-blue-800">
              📦 Reponer Stock (Llegada de Mercancía)
            </h2>
            <form onSubmit={handleReponerStock} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Seleccionar Producto / Cerveza:
                </label>
                <select
                  value={reponerProductoId}
                  onChange={(e) => setReponerProductoId(e.target.value)}
                  className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white text-sm"
                  required
                >
                  <option value="">-- Seleccionar producto --</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} (Stock actual: {p.stock} uds.)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cantidad a ingresar (Unidades):
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Ej. 24, 48"
                  value={reponerCantidad}
                  onChange={(e) => setReponerCantidad(e.target.value)}
                  className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white text-sm"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition-colors"
              >
                ➕ Sumar al Stock
              </button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-4 text-blue-800">
              ✨ Agregar Nueva Cerveza o Producto
            </h2>
            <form onSubmit={handleAgregarProducto} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código:</label>
                  <input
                    type="text"
                    placeholder="015"
                    value={nuevoCodigo}
                    onChange={(e) => setNuevoCodigo(e.target.value)}
                    className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría:</label>
                  <select
                    value={nuevaCategoriaId}
                    onChange={(e) => setNuevaCategoriaId(e.target.value)}
                    className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white text-sm"
                  >
                    {listaCategorias.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Cerveza:</label>
                <input
                  type="text"
                  placeholder="Ej. Heineken Botella"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">P. Venta ($):</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="1.50"
                    value={nuevoPrecioVenta}
                    onChange={(e) => setNuevoPrecioVenta(e.target.value)}
                    className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">P. Compra ($):</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.75"
                    value={nuevoPrecioCompra}
                    onChange={(e) => setNuevoPrecioCompra(e.target.value)}
                    className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock Inicial:</label>
                  <input
                    type="number"
                    placeholder="24"
                    value={nuevoStock}
                    onChange={(e) => setNuevoStock(e.target.value)}
                    className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL Imagen (Opcional):</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={nuevaImagenUrl}
                  onChange={(e) => setNuevaImagenUrl(e.target.value)}
                  className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Guardar Producto en Supabase
              </button>
            </form>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: ARQUEO DE CAJA */}
      {pestanaActiva === "caja" && (
        <div className="max-w-2xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 print:hidden">
          <h2 className="text-2xl font-bold mb-6 text-blue-800">
            💵 Arqueo y Cierre de Caja del Día
          </h2>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Fondo Inicial ($):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fondoInicial}
                  onChange={(e) => setFondoInicial(parseFloat(e.target.value) || 0)}
                  className="w-full p-2 border rounded-lg bg-white font-bold text-sm"
                />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-1">
                  Efectivo de Hoy:
                </p>
                <p className="text-xl sm:text-2xl font-black text-green-600 mt-1">
                  ${totalEfectivoHoy.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-4">
                <span className="text-base sm:text-lg font-bold">Efectivo Esperado en Cajón:</span>
                <span className="text-2xl font-black text-blue-700">
                  ${efectivoEsperadoEnCaja.toFixed(2)}
                </span>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Ingrese el Efectivo Contado Físicamente ($):
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={efectivoContado}
                  onChange={(e) => setEfectivoContado(e.target.value)}
                  className="w-full p-3 border-2 border-blue-200 rounded-xl text-xl font-bold"
                />
              </div>
            </div>

            {efectivoContado !== "" && (
              <div
                className={`p-4 rounded-xl text-center font-bold text-base sm:text-lg ${
                  diferenciaCaja === 0
                    ? "bg-green-100 text-green-800"
                    : diferenciaCaja > 0
                    ? "bg-blue-100 text-blue-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {diferenciaCaja === 0 && "✅ La caja cuadra perfectamente."}
                {diferenciaCaja > 0 && `💙 Sobrante de Dinero: +$${diferenciaCaja.toFixed(2)}`}
                {diferenciaCaja < 0 && `⚠️ Faltante de Dinero: -$${Math.abs(diferenciaCaja).toFixed(2)}`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PESTAÑA 4: REPORTES */}
      {pestanaActiva === "reporte" && (
        <div className="space-y-8 print:hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase">Ventas del Día</p>
              <p className="text-2xl sm:text-3xl font-black text-blue-700 mt-2">
                ${totalVendidoHoy.toFixed(2)}
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase">📈 Ganancia Neta Real</p>
              <p className="text-2xl sm:text-3xl font-black text-green-600 mt-2">
                ${gananciaNetaHoy.toFixed(2)}
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase">💵 Efectivo</p>
              <p className="text-2xl font-bold text-gray-800 mt-2">
                ${totalEfectivoHoy.toFixed(2)}
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase">💳 Tarjeta / Yappy</p>
              <p className="text-2xl font-bold text-gray-800 mt-2">
                ${(totalTarjetaHoy + totalYappyHoy).toFixed(2)}
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center">
              <button
                onClick={cargarReporteVentas}
                className="w-full bg-blue-50 text-blue-700 font-bold py-3 rounded-xl hover:bg-blue-100 transition-colors text-sm"
              >
                🔄 Actualizar Reporte
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-4 text-gray-800">Historial de Ventas</h2>

            {cargandoReporte ? (
              <p className="text-center py-8 text-gray-500">Cargando datos...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-bold text-gray-400 uppercase">
                      <th className="py-3 px-4"># ID Venta</th>
                      <th className="py-3 px-4">Fecha / Hora</th>
                      <th className="py-3 px-4">Método de Pago</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {ventas.map((v) => (
                      <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-4 font-bold text-blue-800">#{v.id}</td>
                        <td className="py-4 px-4 text-gray-600">
                          {v.created_at ? new Date(v.created_at).toLocaleString() : "Reciente"}
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold ${
                              v.metodo_pago === "Efectivo"
                                ? "bg-green-100 text-green-800"
                                : v.metodo_pago === "Tarjeta"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-orange-100 text-orange-800"
                            }`}
                          >
                            {v.metodo_pago || "Efectivo"}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right font-black text-gray-800">
                          ${Number(v.total).toFixed(2)}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => setVentaSeleccionada(v)}
                            className="px-3 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-xs font-semibold"
                          >
                            🔍 Ver Detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DETALLE VENTA */}
      {ventaSeleccionada && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h3 className="text-xl font-bold">Detalle de Venta #{ventaSeleccionada.id}</h3>
              <button
                onClick={() => setVentaSeleccionada(null)}
                className="text-gray-400 hover:text-black font-bold text-xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <p className="text-sm text-gray-600">
                <strong>Fecha:</strong>{" "}
                {ventaSeleccionada.created_at
                  ? new Date(ventaSeleccionada.created_at).toLocaleString()
                  : "Reciente"}
              </p>
              <p className="text-sm text-gray-600">
                <strong>Método de Pago:</strong> {ventaSeleccionada.metodo_pago}
              </p>

              <div className="border-t pt-3 mt-3">
                <p className="font-bold text-sm mb-2 text-gray-700">Productos comprados:</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {ventaSeleccionada.detalle_ventas?.map((d: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm py-1 border-b border-gray-50">
                      <span>
                        {d.cantidad}x {d.productos?.nombre || `Producto #${d.producto_id}`}
                      </span>
                      <span className="font-semibold">${Number(d.subtotal).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-lg font-bold">Total Pagado:</span>
                <span className="text-2xl font-black text-green-600">
                  ${Number(ventaSeleccionada.total).toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setVentaSeleccionada(null)}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* PLANTILLA TICKET PDF IMPRESIÓN */}
      {ticketImpresion && (
        <div id="seccion-ticket-impresion">
          <div style={{ textAlign: "center", marginBottom: "8px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "bold" }}>BAR EL RECREO 🍻</h2>
            <p>Comprobante de Venta</p>
            <p>Cuenta: {ticketImpresion.mesa}</p>
            <p>Ticket #{ticketImpresion.id}</p>
            <p>{ticketImpresion.fecha}</p>
          </div>
          <div style={{ borderTop: "1px dashed black", margin: "8px 0" }}></div>
          <div>
            {ticketImpresion.items.map((item: any, idx: number) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {item.cantidad}x {item.nombre}
                </span>
                <span>${Number(item.subtotal).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px dashed black", margin: "8px 0" }}></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
            <span>PAGO ({ticketImpresion.metodoPago}):</span>
            <span>${Number(ticketImpresion.total).toFixed(2)}</span>
          </div>
          <div style={{ borderTop: "1px dashed black", margin: "8px 0" }}></div>
          <div style={{ textAlign: "center", marginTop: "10px" }}>
            <p>¡Gracias por su compra en Bar El Recreo!</p>
          </div>
        </div>
      )}
    </div>
  );
}