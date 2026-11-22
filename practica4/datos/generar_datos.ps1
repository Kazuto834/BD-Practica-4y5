# Generador de datos limpios para Almacen El Piston
$datosPath = "c:\Users\mario\OneDrive\Escritorio\IPN\escom\BD hurtado\BD-Practica-4y5\practica4\datos"

# 1. CATEGORIAS
$categorias = @(
    "1,Sistemas de Frenos,1",
    "2,Motor y Distribución,1",
    "3,Suspensión y Dirección,2",
    "4,Sistema Eléctrico y Encendido,2",
    "5,Transmisión y Embrague,3",
    "6,Lubricantes y Químicos,1",
    "7,Sistema de Enfriamiento,2",
    "8,Escape y Control de Emisiones,3",
    "9,Carrocería y Cerrajería,4",
    "10,Accesorios e Iluminación,4"
)
$catHeader = "ID_Categoria,Nombre,Nivel_Prioridad"
($catHeader, $categorias) | Out-File -FilePath "$datosPath\categorias.csv" -Encoding utf8

# 2. EMPLEADOS
$turnos = @("Matutino", "Vespertino", "Nocturno", "Mixto")
$nombres = @(
    "Mario Garcia Castillo", "Danaet Gonzáles Martínez", "Diego Islas Ramirez", "Carlos Mendoza Silva",
    "Ana Laura Paredes", "Roberto Hernandez Cruz", "Sofia Jimenez Reyes", "Miguel Angel Torres",
    "Lucia Vargas Ortiz", "Fernando Morales Ruiz", "Patricia Delgado Castro", "Eduardo Sanchez Peña",
    "Gabriela Romero Soto", "Alejandro Flores Perez", "Valeria Gomez Lara", "Ricardo Navarro Colin",
    "Mariana Chavez Diaz", "Daniel Gutierrez Mora", "Beatriz Fuentes Cano", "Hugo Ramirez Luna"
)
$empleados = @()
for ($i = 0; $i -lt $nombres.Count; $i++) {
    $id = $i + 1
    $nom = $nombres[$i]
    $tur = $turnos[$i % $turnos.Count]
    $cert = if ($i % 3 -eq 0) { "TRUE" } else { "FALSE" }
    $empleados += "$id,$nom,$tur,$cert"
}
$empHeader = "ID_Empleado,Nombre,Turno,Certificacion_Montacargas"
($empHeader, $empleados) | Out-File -FilePath "$datosPath\empleados.csv" -Encoding utf8

# 3. UBICACIONES (Zonas A, B, C, D)
$zonas = @("ZONA-A", "ZONA-B", "ZONA-C", "ZONA-D")
$tiposAlm = @("Paletizado", "Caja ligera", "Estanteria pesada", "Material peligroso", "Racks selectivos")
$ubicaciones = @()
$uId = 1
for ($z = 0; $z -lt $zonas.Count; $z++) {
    for ($p = 1; $p -le 4; $p++) {
        for ($r = 1; $r -le 4; $r++) {
            $pasillo = "PAS-{0:D2}" -f $p
            $rack = "RCK-{0:D2}" -f $r
            $nivel = "NIV-{0:D2}" -f (($uId % 4) + 1)
            $capacidad = [math]::Round(500.00 + ($uId * 25.50), 2)
            $tipo = $tiposAlm[($z + $p + $r) % $tiposAlm.Count]
            $ubicaciones += "$uId,$($zonas[$z]),$pasillo,$rack,$nivel,$capacidad,$tipo"
            $uId++
            if ($uId -gt 60) { break }
        }
        if ($uId -gt 60) { break }
    }
    if ($uId -gt 60) { break }
}
$ubiHeader = "ID_Ubicacion,Zona,Pasillo,Rack,Nivel,Capacidad_Peso_Kg,Tipo_Almacenaje"
($ubiHeader, $ubicaciones) | Out-File -FilePath "$datosPath\ubicaciones.csv" -Encoding utf8

# 4. PRODUCTOS (250 productos)
# Subtipos: Piezas Solidas (categorias 1-5, 7-10) y Fluidos Quimicos (categoria 6)
$prodBases = @(
    # Cat 1 Frenos
    @{ Pref="FRE"; Cat=1; Noms=@("Pastillas de Freno Cerámicas", "Disco de Freno Ventilado", "Calíper Delantero", "Tambor de Freno Trasero", "Cilindro Maestro de Frenos", "Manguera de Freno Blindada", "Bomba de Vacío Booster", "Sensor de Desgaste Balatas") },
    # Cat 2 Motor
    @{ Pref="MOT"; Cat=2; Noms=@("Pistón Forjado con Anillos", "Árbol de Levas Deportivo", "Bielas de Alta Resistencia", "Junta de Culata Multilámina", "Bomba de Aceite de Alta Presión", "Válvula de Admisión de Titanio", "Cadena de Distribución", "Polea Tensora de Distribución") },
    # Cat 3 Suspensión
    @{ Pref="SUS"; Cat=3; Noms=@("Amortiguador de Gas Reforzado", "Resorte Helicoidal Progresivo", "Rótula de Suspensión Inferior", "Terminal de Dirección Externa", "Bieleta de Barra Estabilizadora", "Brazo de Control Delantero", "Buje de Horquilla Poliuretano", "Cremallera de Dirección Hidráulica") },
    # Cat 4 Eléctrico
    @{ Pref="ELE"; Cat=4; Noms=@("Alternador 120 Amperios", "Motor de Arranque Reducido", "Batería de Gel AGM 12V", "Bobina de Encendido Individual", "Juego de Cables de Bujía 8mm", "Bujía de Iridio Punta Fina", "Sensor de Oxígeno Primario", "Sensor de Posición Cigüeñal CKP") },
    # Cat 5 Transmisión
    @{ Pref="TRA"; Cat=5; Noms=@("Kit de Embrague Reforzado", "Volante Bimasa de Inercia", "Collarín Hidráulico de Empuje", "Flecha Homocinética Derecha", "Soporte de Caja de Velocidades", "Maza de Rueda con Balero", "Retén de Flecha Salida", "Sincronizador de Tercera y Cuarta") },
    # Cat 6 Lubricantes y Químicos (Fluidos)
    @{ Pref="QUI"; Cat=6; Noms=@("Aceite de Motor Sintético 5W-30", "Aceite de Motor Semi-Sintético 10W-40", "Líquido de Frenos Sintético DOT 4", "Anticongelante Refrigerante 50/50 OAT", "Fluido de Transmisión Automática ATF Dexron VI", "Grasa para Baleros de Alta Temperatura", "Limpiador de Inyectores Concentrado", "Líquido de Dirección Asistida Hidráulica", "Aflojatodo Penetrante en Aerosol", "Desengrasante Biodegradable para Motor") },
    # Cat 7 Enfriamiento
    @{ Pref="ENF"; Cat=7; Noms=@("Radiador de Aluminio de 2 Paneles", "Termostato de Apertura 82C", "Bomba de Agua con Aspas Metálicas", "Ventilador Eléctrico de Enfriamiento", "Depósito de Expansión Anticongelante", "Manguera Superior de Radiador", "Sensor de Temperatura ECT", "Tapón de Radiador 1.1 Bar") },
    # Cat 8 Escape
    @{ Pref="ESC"; Cat=8; Noms=@("Convertidor Catalítico Tres Vías", "Silenciador Trasero de Acero Inoxidable", "Múltiple de Escape Tubular", "Resonador Intermedio Deportivo", "Abrazadera de Tubo de Escape", "Sensor de Temperatura de Gases EGT", "Junta de Brida de Escape", "Tubo Flexible de Escape Reforzado") },
    # Cat 9 Carrocería
    @{ Pref="CAR"; Cat=9; Noms=@("Faro Delantero LED Completo", "Calavera Trasera Ahumada", "Espejo Lateral Eléctrico con Desempañante", "Cofre de Acero Prensado", "Facia Delantera con Guías", "Manija de Puerta Exterior", "Amortiguador Telescópico de Cajuela", "Moldura de Salpicadera Plástica") },
    # Cat 10 Accesorios
    @{ Pref="ACC"; Cat=10; Noms=@("Plumas Limpiaparabrisas de Silicona", "Tapete de Uso Rudo Termoformado", "Kit de Focos LED H4 Ultra Brillantes", "Cubrepolvo de Dirección de Caucho", "Bocina de Aire Tipo Claxon", "Compresor de Aire Portátil 12V", "Cargador Rápido USB para Encendedor", "Filtro de Aire de Cabina con Carbón Activado") }
)

$productos = @()
$piezasSolidas = @()
$fluidosQuimicos = @()
$skuList = @()

$prodIndex = 1
while ($prodIndex -le 250) {
    $family = $prodBases[($prodIndex - 1) % $prodBases.Count]
    $pref = $family.Pref
    $catId = $family.Cat
    $baseNom = $family.Noms[($prodIndex / $prodBases.Count) % $family.Noms.Count]
    $sku = "REP-$pref-{0:D4}" -f $prodIndex
    $skuList += $sku
    $nombre = "$baseNom Spec-$prodIndex"
    
    $largo = [math]::Round(10.0 + (($prodIndex * 3.7) % 85), 2)
    $ancho = [math]::Round(8.0 + (($prodIndex * 2.3) % 65), 2)
    $alto = [math]::Round(5.0 + (($prodIndex * 1.9) % 45), 2)
    $peso = [math]::Round(0.35 + (($prodIndex * 1.45) % 28.5), 2)
    
    $productos += "$sku,$nombre,$largo,$ancho,$alto,$peso,$catId"
    
    if ($catId -eq 6) {
        # Es fluido quimico
        $vol = [math]::Round(250.00 + (($prodIndex * 50) % 3750), 2)
        $inflam = ($prodIndex % 4) + 1
        $refrig = if ($prodIndex % 5 -eq 0) { "TRUE" } else { "FALSE" }
        $fluidosQuimicos += "$sku,$vol,$inflam,$refrig"
    } else {
        # Es pieza solida
        $mats = @("Acero al carbono forjado", "Aluminio aeronáutico 6061", "Cerámica reforzada", "Polímero ABS de alto impacto", "Hierro nodular fundido", "Cobre electrolítico", "Fibra de carbono compuesta")
        $mat = $mats[$prodIndex % $mats.Count]
        $fragil = if ($prodIndex % 4 -eq 0) { "TRUE" } else { "FALSE" }
        $piezasSolidas += "$sku,$mat,$fragil"
    }
    
    $prodIndex++
}

$prodHeader = "SKU,Nombre,Largo_cm,Ancho_cm,Alto_cm,Peso_Kg,ID_Categoria"
($prodHeader, $productos) | Out-File -FilePath "$datosPath\productos.csv" -Encoding utf8

$solHeader = "SKU,Material_Fabricacion,Fragil"
($solHeader, $piezasSolidas) | Out-File -FilePath "$datosPath\piezas_solidas.csv" -Encoding utf8

$fluHeader = "SKU,Volumen_Mililitros,Nivel_Inflamabilidad,Requiere_Refrigeracion"
($fluHeader, $fluidosQuimicos) | Out-File -FilePath "$datosPath\fluidos_quimicos.csv" -Encoding utf8

# 5. ORDENES DE SALIDA (220 ordenes)
$estatusOrd = @("Pendiente", "En picking", "Empacado", "Despachado", "Cancelado")
$ordenes = @()
for ($o = 1; $o -le 220; $o++) {
    $dia = [int](($o % 25) + 1)
    $mes = [int](([math]::Floor($o / 25) % 11) + 1)
    $hora = [int](($o % 14) + 7)
    $min = [int](($o * 7) % 60)
    $sec = [int](($o * 13) % 60)
    $fechaEmision = "2026-{0:D2}-{1:D2} {2:D2}:{3:D2}:{4:D2}" -f $mes, $dia, $hora, $min, $sec
    $estatus = $estatusOrd[$o % $estatusOrd.Count]
    $empId = ($o % 20) + 1
    $ordenes += "$o,$fechaEmision,$estatus,$empId"
}
$ordHeader = "ID_Orden,Fecha_Emision,Estatus,ID_Empleado"
($ordHeader, $ordenes) | Out-File -FilePath "$datosPath\ordenes_salida.csv" -Encoding utf8

# 6. DETALLE DE ORDENES (350 renglones)
$detalles = @()
$lineaTotal = 1
for ($o = 1; $o -le 220; $o++) {
    $numLineas = ($o % 3) + 1
    for ($l = 1; $l -le $numLineas; $l++) {
        $skuSelected = $skuList[($o * 3 + $l) % $skuList.Count]
        $cant = (($o + $l) % 15) + 1
        $detalles += "$o,$l,$skuSelected,$cant"
        $lineaTotal++
    }
}
$detHeader = "ID_Orden,Numero_Linea,SKU,Cantidad_Pedida"
($detHeader, $detalles) | Out-File -FilePath "$datosPath\detalle_ordenes.csv" -Encoding utf8

# 7. INVENTARIO FISICO (300 lotes en almacén)
$inventarios = @()
for ($invId = 1; $invId -le 300; $invId++) {
    $skuSelected = $skuList[$invId % $skuList.Count]
    $ubiId = ($invId % 60) + 1
    $cantidad = (($invId * 17) % 120) + 5
    $diaIng = [int](($invId % 27) + 1)
    $mesIng = [int](([math]::Floor($invId / 30) % 10) + 1)
    $fechaIng = "2026-{0:D2}-{1:D2}" -f $mesIng, $diaIng
    $inventarios += "$skuSelected,$ubiId,$invId,$cantidad,$fechaIng"
}
$invHeader = "SKU,ID_Ubicacion,ID_Inventario,Cantidad,Fecha_Ingreso"
($invHeader, $inventarios) | Out-File -FilePath "$datosPath\inventario_fisico.csv" -Encoding utf8

Write-Output "Generación de datos completada exitosamente."
